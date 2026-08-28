# Behaviour-Neutrality Check

Proving that a change claimed to be behaviour-neutral — a rename, a `phpcbf` run, a "mechanical" refactor — actually is. The method compares PHP **token streams** with whitespace and comments removed, so formatting and comment edits are invisible and any real code change stands out.

Why tokens and not a text diff: a text diff drowns in reindentation and renamed identifiers. A token diff that drops whitespace/comments shows *only* what the parser would see differently — which is exactly the set of changes that can alter behaviour.

## The script

```php
<?php
// neutrality.php — dump the significant token stream of one PHP file.
// Usage: php neutrality.php path/to/file.php
function code( $f ) {
	$o = [];
	foreach ( token_get_all( file_get_contents( $f ) ) as $t ) {
		if ( is_array( $t ) ) {
			if ( in_array( $t[0], [ T_WHITESPACE, T_COMMENT, T_DOC_COMMENT ], true ) ) {
				continue;
			}
			$o[] = token_name( $t[0] ) . ':' . $t[1];
		} else {
			$o[] = $t;
		}
	}
	return $o;
}

$file = $argv[1] ?? '';
if ( '' === $file || ! is_file( $file ) ) {
	fwrite( STDERR, "usage: php neutrality.php <file.php>\n" );
	exit( 2 );
}
echo implode( "\n", code( $file ) ), "\n";
```

## Workflow

Compare the audited (frozen) copy against the current one:

```bash
# One file
php neutrality.php AUDITED-foo-1.4.2/includes/Sync.php > /tmp/before.tok
php neutrality.php path/to/plugin/includes/Sync.php   > /tmp/after.tok
diff /tmp/before.tok /tmp/after.tok

# Whole tree (pair files up by relative path; report any that differ)
( cd AUDITED-foo-1.4.2 && find . -name '*.php' ) | while read -r rel; do
	php neutrality.php "AUDITED-foo-1.4.2/$rel" > /tmp/b.tok 2>/dev/null
	php neutrality.php "path/to/plugin/$rel"    > /tmp/a.tok 2>/dev/null
	if ! diff -q /tmp/b.tok /tmp/a.tok >/dev/null; then
		echo "CHANGED: $rel"
		diff /tmp/b.tok /tmp/a.tok
	fi
done
```

## Reading the result

| Diff shows | Verdict |
|---|---|
| **Empty** | No significant tokens changed. A `phpcbf` / formatter run that only touched whitespace and comments — **safe to accept as formatting-only.** |
| **Only renamed identifiers** (`T_STRING`, `T_CONSTANT_ENCAPSED_STRING`, `T_VARIABLE` values changing from old name to new) | A true rename. Confirm every removal/addition is explainable by the rename in a sentence — e.g. "1 token removed, 231 added, the removal is the old class name." **Neutral.** |
| **A changed operator / keyword / call** — `==` → `===`, `&&` → `and`, a reordered call, an altered default, an added/removed argument | **Not neutral.** A behaviour change wearing a formatting change's clothes (the classic auto-fixer `==`→`===`). Treat it as a real code change: re-verify it against the finding it claims to fix, and log it as a code change, not a rename. |

## Notes

- Token *names* alone aren't enough — compare `name:value` (as the script does). A `phpcbf` alignment pass leaves both identical; an operator swap changes the value.
- PHP version: `token_get_all` reflects the running PHP's tokenizer. Run before/after with the *same* PHP binary so a version difference doesn't masquerade as a code change.
- This proves *token* equivalence, not semantic equivalence — it can't see through a genuine logic rewrite, and it isn't meant to. Its job is to make "I only renamed / reformatted" checkable, and to catch the mechanical change that quietly wasn't.
- Scope it to `*.php`. JS/CSS/asset changes need their own review; this check is for PHP behaviour.

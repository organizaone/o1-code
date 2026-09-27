# Ignoring Files

This document provides an overview of the O1-Code Ignore (`.o1-codeignore`) feature of O1-Code. O1-Code also recognizes custom ignore files configured by `context.fileFiltering.customIgnoreFiles`, which defaults to the compatibility files `.agentignore` and `.aiignore`.

O1-Code includes the ability to automatically ignore files, similar to `.gitignore` (used by Git). Adding paths to `.o1-codeignore` or a configured custom ignore file will exclude them from tools that support this feature, although they will still be visible to other services (such as Git).

## How it works

When you add a path to one of these ignore files, tools that respect O1-Code ignore rules will exclude matching files and directories from their operations. For example, when a tool reads or searches files, any paths in `.o1-codeignore` or configured custom ignore files will be automatically excluded.

For the most part, these ignore files follow the conventions of `.gitignore` files:

- Blank lines and lines starting with `#` are ignored.
- Standard glob patterns are supported (such as `*`, `?`, and `[]`).
- Putting a `/` at the end will only match directories.
- Putting a `/` at the beginning anchors the path relative to the ignore file.
- `!` negates a pattern.

You can update these ignore files at any time. To apply the changes, you must restart your O1-Code session.

## How to use ignore files

| Step                    | Description                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Enable ignore rules** | Create `.o1-codeignore`, a default custom file (`.agentignore` / `.aiignore`), or a configured custom ignore file in your project root directory |
| **Add ignore rules**    | Open the ignore file and add paths to ignore, example: `/archive/` or `apikeys.txt`                                                              |

By default, O1-Code reads `.o1-codeignore`, `.agentignore`, and `.aiignore`.
To use a different custom ignore file, configure:

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

`.o1-codeignore` is always included when `context.fileFiltering.respectO1CodeIgnore`
is enabled. Custom ignore file paths are relative to the project root.

### Ignore file examples

You can use any supported ignore file to ignore directories and files:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

You can use wildcards in your ignore file with `*`:

```
# Exclude all .md files
*.md
```

Finally, you can exclude files and directories from exclusion with `!`:

```
# Exclude all .md files except README.md
*.md
!README.md
```

To remove paths from an ignore file, delete the relevant lines.

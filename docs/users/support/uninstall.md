# Uninstall

O1-Code is installed from npm as a global package. To remove it:

1. Remove the package:

   ```bash
   npm uninstall -g @organizaone/o1-code
   ```

   If you installed from a clone of the repository with `npm link` instead, run `npm unlink -g`
   from the root of that clone and delete the clone. If a command is still found afterwards, check
   where it lives with `which o1-code` (macOS and Linux) or `where o1-code` (Windows) and delete
   that link.

2. Optionally, delete your settings, sessions and memory in `~/.o1-code/`, and any project-level
   `.o1-code/` folders you no longer need. This cannot be undone.

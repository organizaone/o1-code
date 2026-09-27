# Uninstall

O1-Code is installed from a clone of its repository, with `npm link` putting the `o1-code` command
on your `PATH`. To remove it:

1. Remove the linked command. From the root of your clone:

   ```bash
   npm unlink -g
   ```

   If that reports nothing to remove, check where the command lives with `which o1-code` (macOS and
   Linux) or `where o1-code` (Windows) and delete that link.

2. Delete the clone of the repository.

3. Optionally, delete your settings, sessions and memory in `~/.o1-code/`, and any project-level
   `.o1-code/` folders you no longer need. This cannot be undone.

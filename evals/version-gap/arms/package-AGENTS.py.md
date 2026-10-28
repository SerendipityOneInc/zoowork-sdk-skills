# zoowork {{VERSION}}: notes for coding assistants

This is the installed copy of the ZooWork Python SDK, version {{VERSION}}.

The public docs at {{DOCS}} describe the newest SDK release, which can be newer than
this copy. Before you use a method, field, or option from the docs:

- Check that it exists in this package's Python source and type hints. They are the source of truth
  for what {{VERSION}} supports.
- `CHANGELOG.md` in this package lists what each release up to {{VERSION}} added. Later releases are
  listed at https://raw.githubusercontent.com/SerendipityOneInc/zoowork-sdk-python/main/CHANGELOG.md.
- If the docs rely on something {{VERSION}} lacks, tell the user which release adds it and ask before
  upgrading. Do not upgrade the SDK, or work around a missing method with a deprecated one, without
  asking.

Server behavior (errors, event streams, schedules, limits) does not depend on the SDK version.
Follow the live docs for it.

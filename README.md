# projects-beta-pull-request-action
Action for updating beta projects through linked pull requests.

If a pull request has linked issues it will close, this action can update fields for those issues in any beta project they belong to.

**Gotchas:**

The built-in `GITHUB_TOKEN` does not have sufficient privileges to update beta projects. You must provide a token that has full `repo` access and `write:org` permissions.

# Docs Sync Agent

Standalone TypeScript scaffold for the autonomous documentation sync pipeline described in [.github/docs-sync-agent-notes.md](../.github/docs-sync-agent-notes.md).

This is the first deterministic skeleton:

- shared schemas for agent contracts
- repo metadata helpers
- a pipeline entrypoint
- a reusable composite GitHub Action entrypoint in [action.yml](action.yml)
- a GitHub Actions workflow that consumes the local action on pushes to `main`

Next step is to wire the OpenAI Responses API and the docs repo clone/PR automation into the placeholders under `src/`.

## Usage

```yaml
- uses: ./docs-sync-agent
	with:
		github-token: ${{ github.token }}
		openai-api-key: ${{ secrets.OPENAI_API_KEY }}
		docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
		docs-repo-owner: ${{ secrets.DOCS_REPO_OWNER }}
		docs-repo-name: ${{ secrets.DOCS_REPO_NAME }}
		commit-sha: ${{ github.sha }}
		commit-message: ${{ github.event.head_commit.message }}
```
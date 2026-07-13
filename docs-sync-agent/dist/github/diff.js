function buildHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
    };
}
async function requestJson(url, token) {
    const response = await fetch(url, {
        method: "GET",
        headers: buildHeaders(token)
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`GitHub API request failed (${response.status}) for ${url}: ${text}`);
    }
    return JSON.parse(text);
}
function isZeroSha(value) {
    return /^0+$/.test(value);
}
function toChangedFile(file) {
    return {
        path: file.filename,
        status: file.status
    };
}
function buildUnifiedDiff(files) {
    return files
        .map((file) => {
        const patch = file.patch ?? "";
        return [`diff --git a/${file.filename} b/${file.filename}`, patch].join("\n").trim();
    })
        .filter((block) => block.length > 0)
        .join("\n\n");
}
export async function buildDiffContext(commit) {
    const { owner, repo, beforeSha, token, apiUrl } = commit.source;
    let files = [];
    if (beforeSha && !isZeroSha(beforeSha)) {
        const compareUrl = `${apiUrl}/repos/${owner}/${repo}/compare/${beforeSha}...${commit.sha}`;
        const compare = await requestJson(compareUrl, token);
        files = compare.files ?? [];
    }
    else {
        const commitUrl = `${apiUrl}/repos/${owner}/${repo}/commits/${commit.sha}`;
        const details = await requestJson(commitUrl, token);
        files = details.files ?? [];
    }
    return {
        commitMessage: commit.message,
        changedFiles: files.map(toChangedFile),
        gitDiff: buildUnifiedDiff(files)
    };
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is missing.`);
  return value;
}

async function checkQuota() {
  const token = getRequiredEnv("GITHUB_TOKEN");

  if (!token) {
    console.log(
      "\x1b[31mError: GITHUB_TOKEN is not set in your environment\x1b[0m"
    );
    return;
  }

  try {
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        Accept: "application/vnd.github+json",
      },
    });

    const data = await response.json();
    const resources = data.resources;

    console.log("\x1b[1m\x1b[34m📊 GitHub API Resource Map\x1b[0m");

    const targetResource = resources.models || resources.marketplace;

    if (targetResource) {
      const resetDate = new Date(targetResource.reset * 1000);
      const waitMins = Math.round((resetDate.getTime() - Date.now()) / 60000);

      console.log("\n\x1b[32m[MATCH FOUND]\x1b[0m");
      console.log(`Resource:  ${resources.models ? "Models" : "Marketplace"}`);
      console.log(
        `Remaining: ${targetResource.remaining} / ${targetResource.limit}`
      );
      console.log(
        `Resets:    ${resetDate.toLocaleTimeString()} (${waitMins}m)`
      );
    } else {
      console.log(
        "\n\x1b[33m[DEBUG] Available resources found on this token:\x1b[0m"
      );
      Object.keys(resources).forEach((key) => console.log(` - ${key}`));
      console.log(
        "\n\x1b[31mAction Required:\x1b[0m Enable 'Models' or 'Copilot' scopes in your PAT settings."
      );
    }
  } catch (error) {
    console.error("\x1b[31mNetwork Failure:\x1b[0m", error);
  }
}

checkQuota();

import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { TRPCError } from "@trpc/server";
import { clerkClient } from "@clerk/nextjs/server";
import { Octokit } from "octokit";

export const githubRouter = createTRPCRouter({
  getRepositories: baseProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    try {
      // Get user's GitHub OAuth token from Clerk
      const client = await clerkClient();
      const oauthTokens = await client.users.getUserOauthAccessToken(
        ctx.userId,
        "oauth_github"
      );

      if (!oauthTokens.data || oauthTokens.data.length === 0) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "GitHub account not connected. Please sign in with GitHub.",
        });
      }

      const token = oauthTokens.data[0].token;

      // Use Octokit to fetch user's repositories
      const octokit = new Octokit({ auth: token });

      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser(
        {
          sort: "updated",
          per_page: 100,
          affiliation: "owner,collaborator",
        }
      );

      return repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        cloneUrl: repo.clone_url,
        htmlUrl: repo.html_url,
        description: repo.description,
        language: repo.language,
        updatedAt: repo.updated_at,
      }));
    } catch (error) {
      console.error("Error fetching GitHub repos:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch GitHub repositories",
      });
    }
  }),

  getRepository: baseProcedure
    .input(z.object({ owner: z.string(), name: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const client = await clerkClient();
        const oauthTokens = await client.users.getUserOauthAccessToken(
          ctx.userId,
          "oauth_github"
        );

        if (!oauthTokens.data || oauthTokens.data.length === 0) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "GitHub account not connected",
          });
        }

        const token = oauthTokens.data[0].token;
        const octokit = new Octokit({ auth: token });

        const { data: repo } = await octokit.rest.repos.get({
          owner: input.owner,
          repo: input.name,
        });

        return {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          owner: repo.owner.login,
          private: repo.private,
          cloneUrl: repo.clone_url,
          htmlUrl: repo.html_url,
          description: repo.description,
          language: repo.language,
          defaultBranch: repo.default_branch,
        };
      } catch (error) {
        console.error("Error fetching GitHub repo:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch repository details",
        });
      }
    }),
});

import { findRepo, loadConfig } from "../lib/config.ts";
import * as gl from "../lib/gitlab.ts";
import { mergeRequestName } from "../lib/naming.ts";
import { anyValue, arr, num, obj, str } from "../lib/schema.ts";
import { type AnyTool, defineTool } from "../lib/tool.ts";

export const gitlabTools: AnyTool[] = [
  defineTool({
    name: "get-gitlab-branch",
    description: "Recupere une branche distante et son dernier commit. Rend null si la branche n'existe pas encore.",
    inputSchema: obj({ repo: str("Nom du repo du registre."), branch: str("Nom de la branche.") }, ["repo", "branch"]),
    handler: async ({ repo, branch }: { repo: string; branch: string }) =>
      gl.getBranch(findRepo(repo).gitlabProject, branch) ?? null,
  }),

  defineTool({
    name: "get-gitlab-mr",
    description:
      "Lit une merge request, par numero ou par branche source. Rend null si elle n'existe pas : c'est le moyen de savoir si le point 13 a deja publie ce repo.",
    inputSchema: obj(
      { repo: str("Nom du repo."), iid: num("Numero de la MR."), branch: str("Branche source, si le numero est inconnu.") },
      ["repo"],
    ),
    handler: async ({ repo, iid, branch }: { repo: string; iid?: number; branch?: string }) => {
      const project = findRepo(repo).gitlabProject;
      if (iid) return gl.getMergeRequest(project, iid);
      if (branch) return gl.findMergeRequestForBranch(project, branch);
      return { error: "Donne `iid` ou `branch`." };
    },
  }),

  defineTool({
    name: "create-gitlab-mr",
    description:
      "Cree une merge request en brouillon. Reserve au finalizer. Idempotent : si une MR ouverte existe deja sur cette branche, elle est mise a jour au lieu d'etre dupliquee.",
    inputSchema: obj(
      {
        repo: str("Nom du repo."),
        sourceBranch: str("Branche du worktree."),
        title: str("Titre complet. Le prefixe Draft: est ajoute s'il manque."),
        description: str("Description, en francais, reprenant les arbitrages et referencant les MR des autres repos."),
        targetBranch: str("Branche cible. Omise, la baseBranch du registre est utilisee."),
      },
      ["repo", "sourceBranch", "title", "description"],
    ),
    handler: async (input: {
      repo: string;
      sourceBranch: string;
      title: string;
      description: string;
      targetBranch?: string;
    }) => {
      const repo = findRepo(input.repo);
      const mr = await gl.createMergeRequest({
        projectPath: repo.gitlabProject,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch ?? repo.baseBranch,
        title: input.title,
        description: input.description,
      });
      return { repo: repo.name, iid: mr.iid, url: mr.web_url, title: mr.title, draft: mr.title.startsWith("Draft: ") };
    },
  }),

  defineTool({
    name: "update-gitlab-mr",
    description:
      "Modifie une merge request existante. Sert surtout a completer les references croisees une fois que les N MR du ticket sont creees.",
    inputSchema: obj(
      {
        repo: str("Nom du repo."),
        iid: num("Numero de la MR."),
        title: str("Nouveau titre."),
        description: str("Nouvelle description complete."),
        patch: anyValue("Champs bruts de l'API GitLab, pour ce que les deux champs ci-dessus ne couvrent pas."),
      },
      ["repo", "iid"],
    ),
    handler: async (input: { repo: string; iid: number; title?: string; description?: string; patch?: Record<string, unknown> }) => {
      const body: Record<string, unknown> = { ...input.patch };
      if (input.title) body.title = input.title;
      if (input.description) body.description = input.description;
      const mr = await gl.updateMergeRequest(findRepo(input.repo).gitlabProject, input.iid, body);
      return { iid: mr.iid, url: mr.web_url, title: mr.title };
    },
  }),

  defineTool({
    name: "generate-mr-name",
    description:
      "Construit le titre d'une merge request selon la convention d'autopilot.yaml, prefixe Draft: compris. Le type doit etre celui deja retenu pour la branche du repo.",
    inputSchema: obj(
      {
        type: str("Type retenu pour ce repo : feature, bugfix, hotfix, documentation, chore, refactor, test, style, task."),
        ticketId: str("Cle Jira."),
        title: str("Titre du ticket, tel quel."),
      },
      ["type", "ticketId", "title"],
    ),
    handler: ({ type, ticketId, title }: { type: string; ticketId: string; title: string }) => ({
      title: mergeRequestName({ type, ticket: ticketId, titre: title }),
      draft: loadConfig().gitlab.mrDraft,
    }),
  }),

  defineTool({
    name: "get-gitlab-note",
    description: "Lit les notes d'une merge request : commentaires, threads et evenements systeme.",
    inputSchema: obj({ repo: str("Nom du repo."), iid: num("Numero de la MR.") }, ["repo", "iid"]),
    handler: async ({ repo, iid }: { repo: string; iid: number }) => ({
      notes: await gl.listNotes(findRepo(repo).gitlabProject, iid),
    }),
  }),

  defineTool({
    name: "create-gitlab-note",
    description: "Ecrit une note sur une merge request. Tout texte publie passe d'abord par writer-voice-tone.",
    inputSchema: obj(
      { repo: str("Nom du repo."), iid: num("Numero de la MR."), body: str("Corps de la note, en francais.") },
      ["repo", "iid", "body"],
    ),
    handler: async ({ repo, iid, body }: { repo: string; iid: number; body: string }) =>
      gl.createNote(findRepo(repo).gitlabProject, iid, body),
  }),

  defineTool({
    name: "create-gitlab-tag",
    description:
      "Pose un tag cote remote, sans passer par le worktree. A n'utiliser que quand le tag doit exister sur le remote sans commit local correspondant ; sinon push-tag suffit et reste plus proche du depot.",
    inputSchema: obj(
      {
        repo: str("Nom du repo."),
        tag: str("Nom du tag."),
        ref: str("Commit ou branche cible."),
        message: str("Message annote."),
      },
      ["repo", "tag", "ref"],
    ),
    handler: async (input: { repo: string; tag: string; ref: string; message?: string }) => {
      const project = findRepo(input.repo).gitlabProject;
      const existing = await gl.listTags(project);
      if (existing.includes(input.tag)) {
        return { created: false, reason: `Le tag ${input.tag} existe deja cote remote.`, existingTags: existing.slice(0, 20) };
      }
      await gl.createTag(project, input.tag, input.ref, input.message ?? input.tag);
      return { created: true, tag: input.tag };
    },
  }),

  defineTool({
    name: "get-gitlab-pipeline",
    description: "Rend le dernier pipeline d'une ref et l'etat de chacun de ses jobs. Lecture seule, sans attente.",
    inputSchema: obj({ repo: str("Nom du repo."), ref: str("Branche ou tag.") }, ["repo", "ref"]),
    handler: async ({ repo, ref }: { repo: string; ref: string }) => {
      const project = findRepo(repo).gitlabProject;
      const pipeline = await gl.latestPipeline(project, ref);
      if (!pipeline) return { pipeline: null, note: "Aucun pipeline sur cette ref." };
      const jobs = await gl.pipelineJobs(project, pipeline.id);
      return { pipeline, jobs: jobs.map((job) => ({ name: job.name, status: job.status, url: job.web_url })) };
    },
  }),

  defineTool({
    name: "watch-gitlab-pipeline",
    description:
      "Attend le verdict des jobs declares dans ciJobsToWatch, avec timeout. Le verdict porte sur ces jobs, pas sur le statut global du pipeline. Un timeout n'est pas un echec de CI : c'est une escalade a l'humain.",
    inputSchema: obj(
      {
        repo: str("Nom du repo."),
        ref: str("Branche ou tag a suivre."),
        jobs: arr("Jobs a suivre. Omis, ceux du registre sont utilises.", str("Nom de job.")),
        timeoutSeconds: num("Delai maximum. Omis, celui d'autopilot.yaml est utilise."),
      },
      ["repo", "ref"],
    ),
    handler: async (input: { repo: string; ref: string; jobs?: string[]; timeoutSeconds?: number }) => {
      const repo = findRepo(input.repo);
      const result = await gl.watchPipeline({
        projectPath: repo.gitlabProject,
        ref: input.ref,
        jobs: input.jobs ?? repo.ciJobsToWatch,
        timeoutSeconds: input.timeoutSeconds ?? loadConfig().timeouts.ciPipelineSeconds,
      });
      return {
        ...result,
        watched: input.jobs ?? repo.ciJobsToWatch,
        escalate: result.verdict === "timeout",
        note:
          result.verdict === "timeout"
            ? "Timeout : appelle escalate-to-human, ne bumpe pas l'aval sur un pipeline dont on ne sait rien."
            : undefined,
      };
    },
  }),
];

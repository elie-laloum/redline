import * as clack from "@clack/prompts";
import type { WorkflowInputRequest } from "@elie-laloum/outpost";

export interface Prompter {
  ask(request: WorkflowInputRequest): Promise<string | null>;
}

const FREE = "\u0000libre";

export const clackPrompter: Prompter = {
  async ask(request) {
    const [title = "", ...rest] = request.question.split("\n");
    clack.log.step(title);
    const body = rest.join("\n").trim();
    if (body) clack.log.message(body);
    if (request.choices?.length) {
      const options = request.choices.map((choice) => ({ value: choice, label: choice }));
      if (request.allowFreeText !== false) options.push({ value: FREE, label: "Autre reponse…" });
      const choice = await clack.select({ message: "Ta reponse", options });
      if (clack.isCancel(choice)) return null;
      if (choice !== FREE) return choice;
    }
    const text = await clack.text({ message: "Ta reponse", validate: (value) => (value?.trim() ? undefined : "Une reponse vide ne tranche rien.") });
    return clack.isCancel(text) ? null : text;
  },
};

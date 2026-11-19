import type { AssistantTool } from './tool-executor.service';

export const SYDIA_GUIDE_SKILL = 'sydia-guide';

/**
 * Loading the product guide supplies the deployed app address so page
 * directions can become real links. The guide itself stays deployment-neutral
 * and names pages by path.
 */
export function withSydiaGuideLinks(
  tools: AssistantTool[],
  appUrl: string | undefined,
): AssistantTool[] {
  if (!appUrl) return tools;
  const origin = new URL(appUrl).origin;

  return tools.map((tool) =>
    tool.definition.name !== 'load_skill'
      ? tool
      : {
          ...tool,
          async execute(input) {
            const args = input.arguments;
            const guidance = await tool.execute(input);
            if (
              !args ||
              typeof args !== 'object' ||
              Array.isArray(args) ||
              !('name' in args) ||
              args.name !== SYDIA_GUIDE_SKILL ||
              !guidance ||
              typeof guidance !== 'object' ||
              Array.isArray(guidance) ||
              !('guidance' in guidance || 'reference' in guidance)
            )
              return guidance;

            return {
              ...guidance,
              appUrl: {
                instruction:
                  'The Sydia app address. Build a page link as this origin followed by the page path from the guide.',
                origin,
              },
            };
          },
        },
  );
}

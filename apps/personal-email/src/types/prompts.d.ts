declare module 'prompts' {
  export type SelectChoice = { title: string; value: string; description?: string; hint?: string };

  export type SelectPrompt = {
    type: 'select';
    name: string;
    message?: string;
    choices: SelectChoice[];
    initial?: string | number;
  };

  export type TextPrompt = {
    type: 'text';
    name: string;
    message?: string;
    initial?: string;
  };

  export type Prompt = SelectPrompt | TextPrompt;

  /**
   * Simplified prompts signature used by this project.
   * Returns an object with a `value` string for the chosen/entered value.
   */
  function prompts(prompt: Prompt | Prompt[]): Promise<{ value: string }>;

  export default prompts;
}

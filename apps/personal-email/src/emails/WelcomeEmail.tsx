import TemplateRenderer from './TemplateRenderer.js';

export default function WelcomeEmail({ name }: { name: string }) {
  return <TemplateRenderer templateName="welcome" data={{ name }} />;
}

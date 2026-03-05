interface ToolInvocationProps {
  tools: string[];
}

export function ToolInvocation({ tools }: ToolInvocationProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((tool, idx) => (
        <code
          key={idx}
          className="text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-700 font-mono"
        >
          {tool}
        </code>
      ))}
    </div>
  );
}

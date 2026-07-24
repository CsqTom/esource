import { FileCode, FileText } from 'lucide-react';

interface TextViewerProps {
  filePath: string;
  content: string;
}

/** 按文件后缀显示语言标签 */
function getLangLabel(ext: string): string {
  const langMap: Record<string, string> = {
    html: 'HTML', htm: 'HTML', css: 'CSS', js: 'JavaScript', jsx: 'JSX',
    ts: 'TypeScript', tsx: 'TSX', json: 'JSON', md: 'Markdown', xml: 'XML',
    yaml: 'YAML', yml: 'YAML', py: 'Python', rb: 'Ruby', rs: 'Rust',
    go: 'Go', java: 'Java', c: 'C', cpp: 'C++', h: 'C', hpp: 'C++',
    cs: 'C#', php: 'PHP', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
    sql: 'SQL', r: 'R', swift: 'Swift', kt: 'Kotlin', dart: 'Dart',
    scala: 'Scala', toml: 'TOML', ini: 'INI', cfg: 'INI', conf: 'INI',
    gitignore: 'Git', dockerfile: 'Docker', env: 'Env',
  };
  return langMap[ext] || '文本';
}

export function TextViewer({ filePath, content }: TextViewerProps) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const lang = getLangLabel(ext);
  const lines = content.split('\n');
  const isEmpty = content.trim().length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>文件内容为空</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <pre className="font-mono text-xs leading-relaxed p-0">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-gray-800/50">
                    <td className="text-right text-gray-600 select-none px-3 py-0 w-12 border-r border-gray-700/50 align-top">
                      {i + 1}
                    </td>
                    <td className="px-3 py-0 text-gray-200 whitespace-pre">
                      {line || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </pre>
        </div>
      )}
    </div>
  );
}
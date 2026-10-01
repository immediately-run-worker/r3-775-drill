// R3-775 live drill — creates a space carrying a thin-shell SELF bundle and
// mirrors everything on window.__drill so a driven browser can steer it:
// create() writes the bundle, editCode()/editPage() move the two halves of the
// §4c.3 re-offer differential (a src/ edit moves the pin; a pages/ edit does not).
import React, { useEffect, useRef, useState } from 'react';
import fs from 'fs';
import { createSpace, mount as mountById, openSettings } from '@immediately-run/sdk/mounts';

const SPACE_NAME = 'R3-775 self drill';

const BUNDLE_MARKER = JSON.stringify({ opensWith: { self: true } }, null, 2) + '\n';
const BUNDLE_PKG = JSON.stringify({ name: 'self-drill', main: 'src/App.tsx' }, null, 2) + '\n';
const BUNDLE_APP_V1 = [
  'export default function App() {',
  '  return (',
  '    <main style={{ fontFamily: "monospace", padding: 24, fontSize: 18 }}>SELF-RUN-OK v1</main>',
  '  );',
  '}',
  '',
].join('\n');

export default function App() {
  const [line, setLine] = useState('boot…');
  const drill = useRef({ state: 'boot', spaceId: null as string | null, root: null as string | null }).current;
  const render = useState(0)[1];
  const bump = () => render((n) => n + 1);
  const say = (m: string) => {
    drill.state = m;
    setLine(m);
  };
  const errText = (e: unknown) => (e && ((e as { code?: string }).code || (e as Error).message)) || String(e);

  useEffect(() => {
    (async () => {
      try {
        const settings = await openSettings();
        const cfgPath = settings.path + '/r3-775.json';
        let cfg: { spaceId?: string } = {};
        try {
          cfg = JSON.parse(await fs.promises.readFile(cfgPath, 'utf8'));
        } catch {
          /* first run */
        }
        if (cfg.spaceId) {
          const m = await mountById('space:' + cfg.spaceId);
          drill.spaceId = cfg.spaceId;
          drill.root = m.path;
          say('mounted remembered ' + cfg.spaceId + ' @ ' + m.path);
        } else {
          say('no remembered space — press Create');
        }
      } catch (e) {
        say('boot error: ' + errText(e));
      }
      bump();
    })();
  }, [bump]);

  const create = async () => {
    try {
      say('creating space…');
      const m = await createSpace({ name: SPACE_NAME });
      drill.spaceId = m.id;
      drill.root = m.path;
      const root = m.path as string;
      // §4c.2: a self marker at a space ROOT is out of v1 — the bundle lives
      // one level below, in its own folder the panel can focus.
      const bundle = root + '/bundles/self-app';
      await fs.promises.mkdir(bundle, { recursive: true });
      await fs.promises.writeFile(bundle + '/immediately.run.json', BUNDLE_MARKER);
      await fs.promises.writeFile(bundle + '/package.json', BUNDLE_PKG);
      await fs.promises.mkdir(bundle + '/src', { recursive: true });
      await fs.promises.writeFile(bundle + '/src/App.tsx', BUNDLE_APP_V1);
      await fs.promises.mkdir(bundle + '/pages', { recursive: true });
      await fs.promises.writeFile(bundle + '/pages/hello.mdx', '# hello v1\n');
      const settings = await openSettings();
      await fs.promises.writeFile(
        settings.path + '/r3-775.json',
        JSON.stringify({ spaceId: m.id }, null, 2),
      );
      say('created + bundle written ' + m.id);
    } catch (e) {
      say('create error: ' + errText(e));
    }
    bump();
    return drill.state;
  };

  const editCode = async () => {
    if (!drill.root) return 'no root';
    const p = drill.root + '/bundles/self-app/src/App.tsx';
    const cur = await fs.promises.readFile(p, 'utf8');
    const n = cur.includes('v1') ? cur.replace('v1', 'v2') : cur + '\n// touched ' + Date.now() + '\n';
    await fs.promises.writeFile(p, n);
    say('edited src/App.tsx (code extent)');
    bump();
    return drill.state;
  };

  const editPage = async () => {
    if (!drill.root) return 'no root';
    const p = drill.root + '/bundles/self-app/pages/hello.mdx';
    await fs.promises.writeFile(p, '# hello touched ' + Date.now() + '\n');
    say('edited pages/hello.mdx (data extent)');
    bump();
    return drill.state;
  };

  (window as unknown as { __drill: unknown }).__drill = { state: drill.state, create, editCode, editPage, get spaceId() { return drill.spaceId; }, get root() { return drill.root; } };

  return (
    <main style={{ fontFamily: 'monospace', padding: 24 }}>
      <h1>R3-775 drill</h1>
      <p id="drill-state">{line}</p>
      <p>
        <button id="drill-create" onClick={() => void create()}>Create</button>{' '}
        <button id="drill-edit-code" onClick={() => void editCode()}>Edit code</button>{' '}
        <button id="drill-edit-page" onClick={() => void editPage()}>Edit page</button>
      </p>
      <p id="drill-space">{drill.spaceId ?? ''}</p>
    </main>
  );
}

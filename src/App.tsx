// R3-775/R3-904 live drill — mounts a space carrying a thin-shell SELF bundle
// and mirrors everything on window.__drill so a driven browser can steer it:
// mountExisting() mounts an already-owned space (the venue identity's
// createSpace budget is spent — increment-only counters, filed defect), then
// writes the bundle; editCode()/editPage() move the two halves of the §4c.3
// re-offer differential (a src/ edit moves the pin; a pages/ edit does not).
import React, { useEffect, useRef, useState } from 'react';
import fs from 'fs';
import { createSpace, mount as mountById, openSettings, requestSpace } from '@immediately-run/sdk/mounts';
import { BUNDLE_LOCK } from './bundleLock';

const SPACE_NAME = 'R3-775 self drill';
const DEFAULT_SPACE = 'xUkJE8mHYnejJubSlVnb'; // venue-themes-2

const BUNDLE_MARKER = JSON.stringify({ opensWith: { self: true } }, null, 2) + '\n';
// R3-937: the bundle must declare its runtime deps — the platform serves the
// SDK 0.16.0 default and no react-refresh to an undeclared package.json, and
// the generated entry imports `@immediately-run/sdk/boot` regardless.
const BUNDLE_PKG =
  JSON.stringify(
    {
      name: 'self-drill',
      main: 'src/App.tsx',
      dependencies: {
        react: '^19.2.5',
        'react-dom': '^19.2.5',
        '@immediately-run/sdk': '0.54.0',
      },
    },
    null,
    2,
  ) + '\n';
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
  const [, render] = useState(0);
  const bump = useRef(() => render((n) => n + 1)).current;
  const say = (m: string) => {
    drill.state = m;
    setLine(m);
  };
  const errText = (e: unknown) =>
    (e && ((e as { code?: string }).code + ': ' + ((e as Error).message || '(no message)'))) || String(e);

  useEffect(() => {
    (async () => {
      try {
        const settings = await openSettings();
        const cfgPath = settings.path + '/r3-775.json';
        let cfg: { spaceId?: string } = {};
        try {
          cfg = JSON.parse(await fs.promises.readFile(cfgPath, 'utf8'));
        } catch (e) {
          cfg = {}; // first run or the read failed: ' + String(e).slice(0, 60)
        }
        if (cfg.spaceId) {
          const m = await mountById('space:' + cfg.spaceId);
          drill.spaceId = cfg.spaceId;
          drill.root = m.path;
          // Self-heal across instance churn: the grant/mount announce can tear
          // this instance down mid-flight; every boot re-writes the bundle
          // (idempotent) so the drill's exit boxes always find it in place.
          await writeBundle(m.path as string);
          say('mounted remembered ' + cfg.spaceId + ' @ ' + m.path);
        } else {
          try {
            const m = await mountById('space:' + DEFAULT_SPACE);
            drill.spaceId = DEFAULT_SPACE;
            drill.root = m.path;
            await writeBundle(m.path as string);
            say('mounted default ' + DEFAULT_SPACE + ' @ ' + m.path);
          } catch {
            say('no remembered space — press Create or Mount');
          }
        }
      } catch (e) {
        say('boot error: ' + errText(e));
      }
      bump();
    })();
    // `bump` is a stable ref (the 2026-10-01 clobber bug: a fresh closure per
    // render re-ran this effect on every context-churn re-render, overwriting
    // the status line mid-create and masking the real outcome).
  }, [bump]);

  const writeBundle = async (root: string) => {
    const bundle = root + '/bundles/self-app';
    await fs.promises.mkdir(bundle, { recursive: true });
    await fs.promises.writeFile(bundle + '/immediately.run.json', BUNDLE_MARKER);
    await fs.promises.writeFile(bundle + '/package.json', BUNDLE_PKG);
    await fs.promises.writeFile(bundle + '/package-lock.json', BUNDLE_LOCK);
    await fs.promises.mkdir(bundle + '/src', { recursive: true });
    await fs.promises.writeFile(bundle + '/src/App.tsx', BUNDLE_APP_V1);
    await fs.promises.mkdir(bundle + '/pages', { recursive: true });
    await fs.promises.writeFile(bundle + '/pages/hello.mdx', '# hello v1\n');
  };

  const create = async () => {
    try {
      say('creating space…');
      const m = await createSpace({ name: SPACE_NAME });
      drill.spaceId = m.id;
      drill.root = m.path;
      await writeBundle(m.path as string);
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

  // Mount an EXISTING owned space (by id, via the real §8.6 request flow — the
  // host draws its picker/consent chrome) and write the bundle there. The
  // venue identity's per-user create budget is spent (increment-only counters),
  // so the drill mounts a standing venue space instead of creating one.
  const mountExisting = async () => {
    try {
      const w = window as unknown as { __drillMountId?: string };
      const wanted = w.__drillMountId || window.prompt('space id to mount (rw)') || '';
      if (!wanted) return 'no id';
      // Persist the target FIRST: the grant/mount announce may tear this
      // instance down mid-request; the NEXT boot auto-mounts the remembered
      // space (the grant now exists) and re-writes the bundle.
      const settings = await openSettings();
      say('settings at ' + settings.path);
      await fs.promises.writeFile(
        settings.path + '/r3-775.json',
        JSON.stringify({ spaceId: wanted }, null, 2),
      );
      const back = await fs.promises.readFile(settings.path + '/r3-775.json', 'utf8').catch((e) => 'READBACK FAIL ' + e);
      say('cfg written: ' + String(back).slice(0, 60));
      say('requesting a space (picker)…');
      // The powerbox request: the host draws its §8.6 picker, the operator
      // picks the space, the grant is written by the real consent path.
      await requestSpace();
      say('granted — mounting ' + wanted + '…');
      const m = await mountById('space:' + wanted);
      drill.spaceId = wanted;
      drill.root = m.path;
      await writeBundle(m.path as string);
      say('mounted + bundle written ' + wanted + ' @ ' + m.path);
    } catch (e) {
      say('mount error: ' + errText(e));
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

  const cleanup = async () => {
    if (!drill.root) return 'no root';
    try {
      await fs.promises.rm(drill.root + '/bundles/self-app', { recursive: true, force: true });
      say('cleaned bundles/self-app');
    } catch (e) {
      say('cleanup error: ' + errText(e));
    }
    bump();
    return drill.state;
  };

  (window as unknown as { __drill: unknown }).__drill = {
    state: drill.state,
    create,
    mountExisting,
    editCode,
    editPage,
    cleanup,
    get spaceId() { return drill.spaceId; },
    get root() { return drill.root; },
  };

  return (
    <main style={{ fontFamily: 'monospace', padding: 24 }}>
      <h1>R3-775 drill</h1>
      <p id="drill-state">{line}</p>
      <p>
        <button id="drill-create" onClick={() => void create()}>Create</button>{' '}
        <button id="drill-mount" onClick={() => void mountExisting()}>Mount</button>{' '}
        <button id="drill-edit-code" onClick={() => void editCode()}>Edit code</button>{' '}
        <button id="drill-edit-page" onClick={() => void editPage()}>Edit page</button>{' '}
        <button id="drill-cleanup" onClick={() => void cleanup()}>Cleanup</button>
      </p>
      <p id="drill-space">{drill.spaceId ?? ''}</p>
    </main>
  );
}

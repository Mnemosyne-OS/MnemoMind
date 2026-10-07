/**
 * Footer — where the copies live, kept quiet at the bottom so the topics come
 * first. The folder is the one the host answers with each topic's Memory Pack
 * (under the knowledge folder chosen in the Hub): the cartridge never asks for one.
 */
import { S } from './styles';
import type { T } from './types';

/** The copy folder and the no-advice line. */
export function Footer({ t, folder, onOpenFolder }: {
  t: T;
  folder: string | null;
  onOpenFolder: () => void;
}) {
  return (
    <footer style={S.footer}>
      <div style={{ ...S.small, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{folder ? t('footer.folder', { folder }) : t('footer.noFolder')}</span>
        {folder && <button style={S.link} onClick={onOpenFolder}>{t('footer.open')}</button>}
      </div>
      <div style={S.small}>{t('app.advice')}</div>
    </footer>
  );
}

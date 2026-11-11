import avatar from '../assets/theshipar.jpg';
import { IcoCode, IcoExternal } from '../ui/Icons';
import { usePopover } from './usePopover';

const LINKS = [
  { href: 'https://shipar.vercel.app/', label: 'Visit portfolio', hint: 'shipar.vercel.app', icon: <IcoExternal /> },
  { href: 'https://github.com/theShipar', label: 'Other work', hint: 'github.com/theShipar', icon: <IcoExternal /> },
  { href: 'https://github.com/theShipar/packaging-automation-system-visualization', label: 'Source of this project', hint: 'README, architecture and tests', icon: <IcoCode /> },
];

/** Phone-only creator mark in the top-right corner; the rail carries it on wider screens. */
export function CreatorBadge() {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pop-wrap cb-creator" ref={ref}>
      <button className="creator-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label="About the creator">
        <img src={avatar} alt="" width={30} height={30} />
      </button>
      {open && (
        <div className="pop pop-right menu creator-pop" role="dialog" aria-label="About the creator">
          <div className="creator-head">
            <img src={avatar} alt="" width={52} height={52} />
            <span>
              <b>TheShipar</b>
              <small>Designed and built this simulation</small>
            </span>
          </div>
          {LINKS.map((l) => (
            <a key={l.href} className="menu-row" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {l.icon}
              <span>
                {l.label}
                <small>{l.hint}</small>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

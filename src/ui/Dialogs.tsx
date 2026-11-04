import { useEffect, useState, type ReactNode } from 'react';
import { LABS, setLab, useLabs } from '../labs/labs';
import { setZoomsWithKey, useZoomsWithKey, zoomKeyName } from '../labs/wheelZoom';
import { setGlass, useGlass } from '../labs/glass';
import { readJSON, writeJSON } from '../storage';
import { Switch } from './BoardMenu';
import avatar from '../../assets/doodles/people/03-red-hair.png';

/** A big popup over a dimmed board: its title, a cross, and what it holds; Esc or a click on the dim
 *  closes it. */
function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="modal-dim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" aria-label="Закрыть" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** What the profile keeps besides the name (the name is the one others see, see Connection). */
interface Profile { role: string; team: string; email: string; phone: string; zone: string; about: string }
const PROFILE_KEY = 'planx-profile';
const ZONES = ['Москва (UTC+3)', 'Калининград (UTC+2)', 'Екатеринбург (UTC+5)', 'Новосибирск (UTC+7)', 'Владивосток (UTC+10)', 'Лондон (UTC+0)', 'Берлин (UTC+1)'];

/** "Профиль" (the board menu): a character for a picture, the name others see and a few things about you,
 *  kept in this browser. */
export function ProfileDialog({ name, onRename, onClose }: { name: string; onRename: (n: string) => void; onClose: () => void }) {
  const [me, setMe] = useState(name);
  const [p, setP] = useState<Profile>(() => ({ role: '', team: '', email: '', phone: '', zone: ZONES[0], about: '', ...readJSON<Partial<Profile>>(PROFILE_KEY) }));
  const field = (k: keyof Profile) => ({ value: p[k], onChange: (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value }) });
  const save = () => { writeJSON(PROFILE_KEY, p); if (me.trim() && me.trim() !== name) onRename(me.trim()); onClose(); };
  return (
    <Modal title="Профиль" onClose={onClose} className="profile">
      <div className="profile-top">
        <img className="profile-avatar" src={avatar} alt="" />
        <div>
          <div className="profile-name">{me.trim() || 'Без имени'}</div>
          <div className="profile-role">{p.role || 'Должность не указана'}</div>
        </div>
      </div>
      <div className="form-grid">
        <label>Имя<input value={me} maxLength={24} onChange={(e) => setMe(e.target.value)} /></label>
        <label>Должность<input placeholder="Например, продакт-менеджер" {...field('role')} /></label>
        <label>Команда<input placeholder="Например, Мобильная разработка" {...field('team')} /></label>
        <label>Часовой пояс<select {...field('zone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label>Почта<input type="email" placeholder="name@company.ru" {...field('email')} /></label>
        <label>Телефон<input type="tel" placeholder="+7 900 000-00-00" {...field('phone')} /></label>
        <label className="wide">О себе<textarea rows={3} placeholder="Пара слов о себе" {...field('about')} /></label>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
}

/** "Настройки" (the board menu): every feature on trial ("Нововведения", src/labs) with its switch. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const labs = useLabs(), byKey = useZoomsWithKey(), glass = useGlass();
  return (
    <Modal title="Настройки" onClose={onClose} className="settings">
      <div className="settings-list">
        <button className="settings-row" role="menuitemcheckbox" aria-checked={byKey} onClick={() => setZoomsWithKey(!byKey)}>
          <span><b>Зум с {zoomKeyName()}</b><i>{`Масштаб — ${zoomKeyName()} + колесо, а просто колесо листает доску по вертикали. Выключено: масштаб просто колесом`}</i></span>
          <Switch on={byKey} />
        </button>
        <button className="settings-row" role="menuitemcheckbox" aria-checked={glass} onClick={() => setGlass(!glass)}>
          <span><b>Стекло</b><i>Панели и попапы полупрозрачные (84%), доска за ними размыта</i></span>
          <Switch on={glass} />
        </button>
      </div>
      <div className="settings-title">Нововведения</div>
      <div className="settings-list labs-list">
        {LABS.map((l) => (
          <button key={l.id} className="settings-row" role="menuitemcheckbox" aria-checked={labs[l.id]} onClick={() => setLab(l.id, !labs[l.id])}>
            <span><b>{l.label}</b><i>{l.hint}</i></span>
            <Switch on={labs[l.id]} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

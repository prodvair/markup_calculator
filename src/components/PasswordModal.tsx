import { useState } from "react";

type Props = {
  error: string;
  busy: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

export default function PasswordModal({ error, busy, onSubmit, onCancel }: Props) {
  const [password, setPassword] = useState("");

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Вход в редактор">
      <form
        className="modal modal--small"
        onSubmit={(event) => {
          event.preventDefault();
          const value = password;
          setPassword("");
          onSubmit(value);
        }}
      >
        <div className="modal__head">
          <div>
            <h2>Редактор формул</h2>
            <p className="hint">Введите пароль, чтобы изменить расчёты.</p>
          </div>
        </div>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Проверяем…" : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}

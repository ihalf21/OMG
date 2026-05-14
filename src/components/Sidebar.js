import React, { useState } from 'react';
import { Modal } from './UI';

const CHANGELOG = [
  {
    version: '0.11',
    date: '2025',
    changes: [
      'Зависимые задачи: при создании задачи можно указать задачу-предшественника. Дата старта рассчитается автоматически, инженеры перенесутся',
      'Плановые задачи без даты старта: отображаются серой штриховкой на Ганте, визуально стартуют с сегодняшнего дня. Дата обновляется ежедневно пока не задана',
      'Перетаскивание строк на диаграмме Ганта — меняет порядок задач. Иконка ⠿ слева от названия',
      'Дашборд: для задач со срывом сроков показывает сколько инженеров нужно добавить чтобы уложиться',
    ],
  },
  {
    version: '0.10',
    date: '2025',
    changes: [
      'Исправлена логика статусов задачи: Опережение — запас > 15% до дедлайна; Впритык — запас ≤ 15%; Срыв сроков — выходим за дедлайн. Без дедлайна — всегда зелёный',
      'Переименован статус «Риск дедлайна» → «Срыв сроков»',
      'Создание задачи разбито на 2 шага: шаг 1 — название, направление, даты; шаг 2 — оценка по этапам (Анализ, Актуализация, Разработка, Тестирование)',
      'Все этапы оценки опциональны. Итоговая оценка = сумма этапов',
      'Карточка задачи показывает разбивку оценки по этапам',
      'В режиме редактирования задачи можно вернуться и заполнить оценку по этапам',
    ],
  },
  {
    version: '0.9',
    date: '2025',
    changes: [
      'Роль «Лид» теперь доступна при создании и редактировании инженера',
      'Для роли Лид скрыты «Регулярная задача» и матрица опыта — лид отвечает за все процессы',
      'Кнопка «💾 Сохранить тестовые данные» в сайдбаре — сохраняет текущее состояние в server/seed.json',
      'Сброс данных теперь восстанавливает сохранённый пользователем набор (если он есть), иначе встроенный',
      'Макет центрирован по горизонтали с максимальной шириной 1440px — для удобства на 2К мониторах',
    ],
  },
  {
    version: '0.8',
    date: '2025',
    changes: [
      'Добавлен бэкенд на Node.js + Express + SQLite — данные теперь хранятся в файле omg.db на компьютере',
      'Автосохранение: любые изменения сохраняются на сервер автоматически через 0.8 секунды',
      'Кнопка «Сбросить тестовые данные» в нижней части сайдбара — мгновенно возвращает базу к тестовому набору',
      'Экран загрузки при старте приложения',
      'Экран ошибки если сервер недоступен — с инструкцией как запустить',
    ],
  },
  {
    version: '0.7',
    date: '2025',
    changes: [
      'Диаграмма Ганта: добавлены номера недель над шкалой (один раз на всю неделю) и дни недели под числами (Пн, Вт, Ср...)',
      'Задачи: убран атрибут «Тип» (регулярная/нерегулярная), добавлен «Направление» из справочника регулярных задач',
      'Рекомендованные инженеры на карточке задачи теперь сортируются по направлению — инженеры с совпадающей регулярной задачей помечаются бейджем «основное» и идут первыми',
      'В рекомендациях отображается опыт инженера по направлению задачи (звёздочки)',
    ],
  },
  {
    version: '0.6',
    date: '2025',
    changes: [
      'Диаграмма Ганта: чекбокс «Только рабочие дни» — скрывает выходные и праздники, оставляя только рабочие дни. Показывает количество рабочих дней в месяце',
      'Переименован атрибут «Домашняя задача» → «Регулярная задача» — теперь это справочное поле из фиксированного списка: Релиз, Регресс, Смоук, Синхронизация, Сверка, Приёмка, Спецзадачи',
      'Матрица опыта теперь построена по справочнику регулярных задач (не по задачам в системе). Основная задача инженера отмечена в матрице',
      'Форма добавления и редактирования инженера обновлена под новый справочник',
    ],
  },
  {
    version: '0.5',
    date: '2025',
    changes: [
      'Исправлен критический баг с датами: toISOString() возвращал UTC и сдвигал дату на -1 день при часовых поясах UTC+3 и выше (Москва). Теперь везде используется локальное время пользователя',
      'Исправлено: 9 мая и другие праздники теперь корректно определяются как нерабочие дни на диаграмме Ганта',
      'Добавлены праздники РФ на 2026 год',
      'Дата "сегодня" теперь всегда соответствует системному времени пользователя',
    ],
  },
  {
    version: '0.4',
    date: '2025',
    changes: [
      'Оценка задач переведена с человеко-дней на человеко-часы (чч)',
      'Коэффициенты производительности по роли: инженер=1.0, стажёр=0.5, ответственный=0.5, лид=0',
      'Буфер для стажёров убран — их вклад автоматически считается как 0.5',
      'Карточка задачи: отображается мощность каждого инженера и суммарная мощность команды',
      'Расчёт оставшегося времени в часах и днях',
      'Форма создания/редактирования задачи обновлена под новую логику',
    ],
  },
  {
    version: '0.3',
    date: '2025',
    changes: [
      'Исправлено положение флажка дедлайна на диаграмме Ганта — теперь стоит на правом крае дня дедлайна',
      'Добавлены всплывающие подсказки (tooltips) на диаграмме Ганта для задач, инженеров и строки доступности',
      'Переработана страница Команда: удаление инженеров с подтверждением',
      'Кнопки «Редактировать» на карточках задач и инженеров полностью работают',
      'Матрица опыта: звёздочки редактируются только в режиме редактирования карточки инженера',
      'Фильтр «В работе» по умолчанию на странице Задачи',
      'Иконки 👍/👎 для завершённых задач (вовремя / с опозданием)',
    ],
  },
  {
    version: '0.2',
    date: '2025',
    changes: [
      'Тёмная тема с оранжевым акцентом и переключатель в топбаре',
      'Часы с системным временем в топбаре',
      'Увеличен шрифт для лучшей читаемости на 2К мониторах',
      'Фильтр "В работе" по умолчанию на странице Задачи',
      'Иконки успеха/провала для завершённых задач (👍 / 👎)',
      'Всплывающие подсказки (tooltips) на диаграмме Ганта',
      'Удаление инженеров на странице Команда',
      'Кнопки "Редактировать" на карточках задач и инженеров',
      'Матрица опыта переделана на звёздочки (0–5), редактирование только в режиме редактирования',
      'Исправлено положение флажка дедлайна на диаграмме Ганта',
      'Улучшен контраст интерфейса — яркие акценты на кнопках',
      'История версий в сайдбаре',
    ],
  },
  {
    version: '0.1',
    date: '2025',
    changes: [
      'Первая версия приложения OMG — Oh My Gantt',
      'Дашборд с метриками команды и задач',
      'Список задач с фильтрами по типу и дедлайну',
      'Карточка задачи с прогрессом, командой и историей',
      'Список команды с фильтрами по роли и статусу',
      'Карточка инженера с матрицей опыта и историей занятости',
      'Диаграмма Ганта с режимами "задачи" и "команда"',
      'Учёт праздников РФ и выходных дней',
      'Автоматический пересчёт сроков при изменении команды',
      'Учёт отпусков и больничных в расчёте доступности',
      'Сохранение данных в localStorage',
    ],
  },
];

function IconDashboard({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  );
}

function IconTasks({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke={c} strokeWidth="1.5"/>
      <line x1="5" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="9" x2="13" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="10" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconTeam({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M1.5 16c0-3 2.5-4.5 5.5-4.5S12.5 13 12.5 16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13.5" cy="6.5" r="2" stroke={c} strokeWidth="1.3"/>
      <path d="M16.5 16c0-2.5-1.3-3.8-3-4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconGantt({ active }) {
  const c = active ? 'var(--accent)' : 'var(--text-tertiary)';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="3" y1="2.5" x2="3" y2="14.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3" y1="14.5" x2="15.5" y2="14.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="5" y="4" width="7" height="2.5" rx="1" fill={c}/>
      <rect x="7" y="7.5" width="5.5" height="2.5" rx="1" fill={c} opacity="0.75"/>
      <rect x="5" y="11" width="3.5" height="2.5" rx="1" fill={c} opacity="0.45"/>
    </svg>
  );
}

function IconEstimate({ active }) {
  const c = active ? '#1D9E75' : '#8C8B87';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke={c} strokeWidth="1.5"/>
      <line x1="5" y1="6" x2="8" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="9" x2="8" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="9" x2="13" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="8" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="11" y2="12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Дашборд',   Icon: IconDashboard },
  { id: 'tasks',     label: 'Задачи',    Icon: IconTasks },
  { id: 'estimate',  label: 'Оценка',    Icon: IconEstimate },
  { id: 'team',      label: 'Команда',   Icon: IconTeam },
  { id: 'gantt',     label: 'Диаграмма', Icon: IconGantt },
];

export default function Sidebar({ activePage, onNavigate, onReset, onSaveSeed }) {
  const [showChangelog, setShowChangelog] = useState(false);
  const active = activePage === 'task' ? 'tasks' : activePage === 'engineer' ? 'team' : activePage;
  const currentVersion = CHANGELOG[0].version;

  return (
    <>
      <div style={{
        width: 224, minWidth: 224,
        background: 'var(--bg-primary)',
        borderRight: '0.5px solid var(--border-light)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '0.5px solid var(--border-light)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>OMG</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Oh My Gantt</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 0', flex: 1 }}>
          {NAV.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <div key={id} onClick={() => onNavigate(id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', fontSize: 14,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--bg-secondary)' : 'transparent',
                borderLeft: `2.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon active={isActive} />
                {label}
              </div>
            );
          })}
        </nav>

        {/* Version history + reset */}
        <div style={{ borderTop: '0.5px solid var(--border-light)', padding: '12px 20px', display:'flex', flexDirection:'column', gap:8 }}>
          <div
            onClick={() => setShowChangelog(true)}
            style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span>📋</span>
            <span>История версий v{currentVersion}</span>
          </div>
          <div
            onClick={onSaveSeed}
            style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span>💾</span>
            <span>Сохранить тестовые данные</span>
          </div>
          <div
            onClick={onReset}
            style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span>🔄</span>
            <span>Сбросить тестовые данные</span>
          </div>
        </div>
      </div>

      {showChangelog && (
        <Modal title="История версий" onClose={() => setShowChangelog(false)} width={520}>
          <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
            {CHANGELOG.map((ver, vi) => (
              <div key={ver.version} style={{ marginBottom: vi < CHANGELOG.length - 1 ? 24 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>v{ver.version}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{ver.date}</div>
                  {vi === 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent)', fontWeight: 600 }}>текущая</span>}
                </div>
                <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ver.changes.map((c, i) => (
                    <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowChangelog(false)} style={{
              padding: '8px 24px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Закрыть</button>
          </div>
        </Modal>
      )}
    </>
  );
}

# Развёртывание OMG на корпоративном сервере

Инструкция предназначена для системного администратора, который разворачивает OMG, подключает корпоративный Keycloak и настраивает первоначальный административный доступ владельца платформы.

Примеры ниже рассчитаны на Linux, `systemd`, nginx и `oauth2-proxy`. Если в компании используется IIS, Kubernetes Ingress, Traefik или корпоративный API Gateway, схема остаётся той же: внешний компонент выполняет OIDC-аутентификацию, а OMG получает только проверенный идентификатор пользователя в HTTP-заголовке.

## 1. Как устроена аутентификация

OMG не является самостоятельным OIDC-клиентом и не проверяет Keycloak-токены. Аутентификация должна происходить перед приложением:

```text
браузер -> HTTPS reverse proxy -> Keycloak/OIDC -> OMG на 127.0.0.1:3001
```

После успешного входа reverse proxy передаёт OMG один проверенный идентификатор пользователя. Backend ищет активного пользователя в SQLite по `id`, `login` или `externalId`.

Поддерживаемые заголовки, в порядке приоритета:

1. `X-OMG-User-ID`
2. `X-Auth-Request-User`
3. `X-Auth-Request-Email`
4. `X-Forwarded-User`

Рекомендуемый вариант:

- если корпоративный gateway умеет передавать Keycloak `sub`, передавать его в `X-OMG-User-ID`, а в OMG записать в поле `External ID`;
- если используется стандартный `oauth2-proxy`, передавать `preferred_username` в `X-Auth-Request-User`, а в OMG записать то же значение в поле `Логин`;
- выбрать один основной идентификатор и не менять его после ввода системы в эксплуатацию.

Сопоставление выполняется точным сравнением. Регистр, доменный суффикс и формат логина должны совпадать. Например, `ivanov`, `IVANOV` и `ivanov@company.ru` считаются разными значениями.

> **Критически важно:** порт Node.js `3001` нельзя публиковать во внешнюю сеть. При отсутствии пользовательского заголовка текущая версия приложения использует встроенную bootstrap-учётную запись `u-admin`. Без сетевой изоляции это даст административный доступ в обход Keycloak.

## 2. Данные, которые нужно получить до начала работ

Системный администратор должен заранее зафиксировать:

```text
Публичный URL OMG:          https://omg.company.ru
URL Keycloak:               https://keycloak.company.ru
Realm:                      <REALM>
OIDC Client ID:             omg-prod
OIDC Client Secret:         <SECRET>

Владелец OMG, ФИО:          <ФИО>
Корпоративный логин:        <OWNER_LOGIN>
Корпоративный email:        <OWNER_EMAIL>
Keycloak subject (sub):     <OWNER_KEYCLOAK_SUB>
Основной передаваемый claim: sub / preferred_username / email
```

Значения `OWNER_LOGIN` и `OWNER_KEYCLOAK_SUB` необходимо получить из той же учётной записи Keycloak, которой владелец будет реально входить в OMG.

До переключения production-трафика также рекомендуется определить вторую корпоративную учётную запись глобального администратора для аварийного доступа.

## 3. Ролевая модель

- Глобальный администратор видит все проекты и все разделы, управляет пользователями и доступами.
- Проектный администратор работает только с назначенными проектами и имеет доступ к отчётам.
- Проектный лид работает только с назначенными проектами, без разделов «Отчёты», «Администрирование» и «Заметки».
- «Администрирование» и «Заметки» доступны только глобальному администратору.

Владельцу платформы необходимо назначить именно глобальную роль `admin`. Проектные роли ему необязательны: глобальный администратор и без них видит все проекты.

## 4. Требования к серверу

- Node.js `22.13+` или более новая LTS-версия с модулем `node:sqlite`.
- npm.
- Git и доступ к корпоративному GitLab.
- nginx, IIS, Traefik, Ingress или другой reverse proxy с HTTPS.
- Keycloak либо корпоративный OIDC-шлюз.
- Отдельный системный пользователь, например `omg`.
- Отдельные каталоги для приложения, базы и резервных копий.

Проверка Node.js:

```bash
node --version
node -e "require('node:sqlite'); console.log('node:sqlite ok')"
```

Рекомендуемая структура:

```text
/opt/omg/                 код и production build
/var/lib/omg/             рабочая SQLite-база
/var/backups/omg/         резервные копии
/etc/omg/                 конфигурация и секреты
```

Создание каталогов:

```bash
sudo useradd --system --home /opt/omg --shell /usr/sbin/nologin omg
sudo install -d -o omg -g omg -m 0750 /opt/omg
sudo install -d -o omg -g omg -m 0750 /var/lib/omg
sudo install -d -o omg -g omg -m 0750 /var/backups/omg
sudo install -d -o root -g omg -m 0750 /etc/omg
```

## 5. Установка приложения

```bash
sudo -u omg git clone ssh://git@gl.rnd.lanit.ru:2222/DIT/omg.git /opt/omg
cd /opt/omg
sudo -u omg npm install --legacy-peer-deps
cd server
sudo -u omg npm install
cd ..
sudo -u omg npm run build
sudo -u omg npm test
```

В production отдельный React dev-server не нужен. После `npm run build` Express отдаёт и `/api/*`, и frontend из каталога `build/`.

## 6. Конфигурация OMG

Создать `/etc/omg/omg.env`:

```bash
NODE_ENV=production
PORT=3001
OMG_SQLITE_PATH=/var/lib/omg/omg.sqlite
OMG_BACKUP_DIR=/var/backups/omg
```

Права:

```bash
sudo chown root:omg /etc/omg/omg.env
sudo chmod 0640 /etc/omg/omg.env
```

Для первоначальной настройки администратора временно можно добавить:

```bash
OMG_DEV_USER_ID=u-admin
```

Эта переменная предназначена только для bootstrap через локальный интерфейс или SSH-туннель. После проверки корпоративной учётной записи её нужно удалить и перезапустить сервис.

## 7. Сервис systemd

Создать `/etc/systemd/system/omg.service`:

```ini
[Unit]
Description=OMG project management platform
After=network.target

[Service]
Type=simple
User=omg
Group=omg
WorkingDirectory=/opt/omg
EnvironmentFile=/etc/omg/omg.env
ExecStart=/usr/bin/node /opt/omg/server/index.js
Restart=on-failure
RestartSec=5
UMask=0027

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/omg /var/backups/omg

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now omg
sudo systemctl status omg
curl http://127.0.0.1:3001/api/health
```

Порт `3001` должен быть закрыт firewall для всех внешних адресов. Доступ к нему разрешается только локальному reverse proxy.

## 8. Перенос существующей базы

Рабочие данные хранятся в SQLite. Не переносить базу простым копированием во время работы приложения.

На исходной машине сначала создать согласованную копию:

```bash
cd /path/to/omg
OMG_BACKUP_DIR=/safe/path npm run db:backup
```

Полученный файл `omg-<timestamp>.sqlite` перенести на сервер как:

```text
/var/lib/omg/omg.sqlite
```

Затем:

```bash
sudo chown omg:omg /var/lib/omg/omg.sqlite
sudo chmod 0640 /var/lib/omg/omg.sqlite
sudo systemctl restart omg
```

Если база создаётся с нуля:

```bash
cd /opt/omg
sudo -u omg bash -lc 'set -a; source /etc/omg/omg.env; set +a; cd /opt/omg; npm run db:migrate'
```

Команда выведет путь к SQLite и количество проектов, пользователей и назначений.

## 9. Настройка клиента в Keycloak

Создать отдельный OIDC client, например `omg-prod`:

- Client type: `OpenID Connect`.
- Client authentication: включена, confidential client.
- Standard flow: включён.
- Direct access grants: не требуется.
- Root/Home URL: `https://omg.company.ru`.
- Valid redirect URI: `https://omg.company.ru/oauth2/callback`.
- Valid post logout redirect URI: `https://omg.company.ru/*` — если поддерживается корпоративной политикой.
- Web origins: `https://omg.company.ru`.
- Scopes: `openid profile email`.

Проверить, что токен содержит:

- `sub` — стабильный Keycloak ID;
- `preferred_username` — корпоративный логин;
- `email` — если вход будет сопоставляться по email.

Client Secret хранить только в защищённом конфигурационном файле или корпоративном secret storage. Не добавлять его в GitLab.

## 10. Пример oauth2-proxy

Если корпоративный reverse proxy уже умеет выполнять OIDC-аутентификацию и передавать проверенный claim, отдельный `oauth2-proxy` не нужен.

Минимальные параметры `oauth2-proxy` для стандартной схемы:

```ini
provider = "keycloak-oidc"
oidc_issuer_url = "https://keycloak.company.ru/realms/<REALM>"
client_id = "omg-prod"
client_secret = "<CLIENT_SECRET>"
redirect_url = "https://omg.company.ru/oauth2/callback"

upstreams = [ "static://202" ]
scope = "openid profile email"
email_domains = [ "*" ]

reverse_proxy = true
set_xauthrequest = true
pass_user_headers = true

cookie_secure = true
cookie_httponly = true
cookie_samesite = "lax"
cookie_secret = "<RANDOM_COOKIE_SECRET>"
```

Cookie secret должен быть случайным и храниться вне Git. Способ генерации зависит от принятой версии `oauth2-proxy`; использовать команду из официальной документации установленной версии.

## 11. Пример nginx

Ниже используется `X-Auth-Request-User` с `preferred_username`. Если корпоративный gateway передаёт `sub`, вместо этого он должен установить `X-OMG-User-ID`.

```nginx
server {
    listen 443 ssl http2;
    server_name omg.company.ru;

    ssl_certificate     /etc/ssl/certs/omg.crt;
    ssl_certificate_key /etc/ssl/private/omg.key;

    client_max_body_size 10m;

    location /oauth2/ {
        proxy_pass http://127.0.0.1:4180;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Auth-Request-Redirect $scheme://$host$request_uri;
    }

    location = /oauth2/auth {
        proxy_pass http://127.0.0.1:4180;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    location / {
        auth_request /oauth2/auth;
        error_page 401 = /oauth2/sign_in?rd=$scheme://$host$request_uri;

        auth_request_set $authenticated_user  $upstream_http_x_auth_request_user;
        auth_request_set $authenticated_email $upstream_http_x_auth_request_email;

        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Не доверять одноимённым заголовкам, которые прислал браузер.
        # Передавать только значение, полученное от OIDC-компонента.
        proxy_set_header X-OMG-User-ID "";
        proxy_set_header X-Auth-Request-User $authenticated_user;
        proxy_set_header X-Auth-Request-Email "";
        proxy_set_header X-Forwarded-User "";
    }
}
```

Обязательные требования независимо от выбранного proxy:

1. Запрос без Keycloak-сессии не должен попадать в OMG.
2. Все четыре поддерживаемых OMG-заголовка от внешнего клиента должны удаляться или перезаписываться.
3. В OMG должен передаваться только claim, полученный после проверки OIDC-сессии.
4. Node.js-порт `3001` не должен быть доступен из пользовательской сети.
5. `/api/*` и frontend должны проходить через одну и ту же аутентификацию.

## 12. Первоначальная настройка учётной записи владельца

Это критическая последовательность. Не отключать bootstrap-доступ, пока вход через Keycloak не проверен владельцем.

### Шаг 1. Открыть OMG локально

На время bootstrap приложение должно оставаться недоступным из внешней сети. Открыть SSH-туннель:

```bash
ssh -L 13001:127.0.0.1:3001 sysadmin@omg-server
```

Затем открыть в браузере:

```text
http://127.0.0.1:13001
```

При активной bootstrap-учётной записи интерфейс откроется как глобальный администратор `u-admin`.

### Шаг 2. Создать корпоративную учётную запись владельца

В разделе «Администрирование» добавить пользователя:

```text
ID:               u-owner или другой постоянный внутренний ID
Логин:            точное значение <OWNER_LOGIN>
Имя:              ФИО владельца
External ID:      <OWNER_KEYCLOAK_SUB>, если будет использоваться sub
Глобальная роль:  Админ
Статус:           Активен
```

Если reverse proxy передаёт `preferred_username`, поле `Логин` должно точно совпадать с этим claim.

Если reverse proxy передаёт `sub` в `X-OMG-User-ID`, поле `External ID` должно точно совпадать с `sub`.

Проектные роли владельцу можно не назначать: глобальный администратор имеет доступ ко всем проектам и разделам.

### Шаг 3. Проверить сопоставление без браузера

На самом сервере выполнить запрос с тем заголовком, который будет устанавливать proxy.

Для логина:

```bash
curl -sS \
  -H 'X-Auth-Request-User: <OWNER_LOGIN>' \
  http://127.0.0.1:3001/api/me
```

Для Keycloak `sub`:

```bash
curl -sS \
  -H 'X-OMG-User-ID: <OWNER_KEYCLOAK_SUB>' \
  http://127.0.0.1:3001/api/me
```

Ожидаемый результат должен содержать корпоративного пользователя владельца:

```json
{
  "user": {
    "id": "u-owner",
    "globalRole": "admin",
    "active": true
  }
}
```

Если вернулся `u-admin`, проверяется не тот заголовок или он пустой. Если вернулся `401`, значение не совпадает с `id`, `login` или `externalId` активного пользователя.

### Шаг 4. Проверить реальный вход через Keycloak

1. Включить публичный URL только через reverse proxy.
2. Открыть `https://omg.company.ru` в новом приватном окне браузера.
3. Войти корпоративной учётной записью владельца.
4. Открыть `https://omg.company.ru/api/me` и убедиться, что отображается `globalRole: "admin"`.
5. В интерфейсе убедиться, что видны все проекты и разделы:
   - «Отчёты»;
   - «Администрирование»;
   - «Заметки».
6. Попросить владельца самостоятельно повторить вход с рабочего компьютера.

Если любой пункт не выполнен, переключение не завершать и bootstrap-учётную запись не отключать.

### Шаг 5. Закрепить доступ

После двух успешных входов владельца:

```bash
cd /opt/omg
sudo -u omg bash -lc 'set -a; source /etc/omg/omg.env; set +a; cd /opt/omg; npm run db:backup'
```

Затем:

1. Удалить `OMG_DEV_USER_ID` из `/etc/omg/omg.env`.
2. Перезапустить OMG: `sudo systemctl restart omg`.
3. Ещё раз проверить вход владельца через Keycloak.
4. Создать второго глобального администратора либо согласованный аварийный аккаунт.
5. После проверки второго администратора отключить пользователя `u-admin` на странице «Администрирование».

Отключение `u-admin` полезно как дополнительная защита: при потере пользовательского заголовка backend вернёт `401`, а не откроет bootstrap-администратора. Делать это можно только после создания резервной копии и проверки корпоративных администраторов.

## 13. Проверка защиты от подмены заголовков

Неаутентифицированный запрос к публичному URL должен перенаправляться в Keycloak или возвращать `401`, но не данные OMG:

```bash
curl -I https://omg.company.ru/
curl -I https://omg.company.ru/api/me
```

Попытка передать пользовательский заголовок извне не должна обходить Keycloak:

```bash
curl -I \
  -H 'X-OMG-User-ID: u-admin' \
  https://omg.company.ru/api/me
```

Запрос не должен возвращать JSON пользователя `u-admin`. Если возвращает — reverse proxy настроен небезопасно, вводить систему в эксплуатацию нельзя.

## 14. Резервное копирование

Ручной backup:

```bash
cd /opt/omg
sudo -u omg bash -lc 'set -a; source /etc/omg/omg.env; set +a; cd /opt/omg; npm run db:backup'
```

Рекомендуемый минимум:

- ежедневная резервная копия;
- хранение нескольких последних копий;
- отдельное хранилище или backup-система;
- периодическая проверка восстановления;
- обязательный backup перед обновлением приложения, изменением ролей и ручной работой с SQLite.

Не копировать только `omg.sqlite` обычной файловой командой во время работы приложения: SQLite использует WAL. Применять `npm run db:backup` либо останавливать сервис перед копированием.

## 15. Обновление приложения

```bash
sudo systemctl stop omg
cd /opt/omg
sudo -u omg bash -lc 'set -a; source /etc/omg/omg.env; set +a; cd /opt/omg; npm run db:backup'

sudo -u omg git fetch
sudo -u omg git checkout main
sudo -u omg git pull --ff-only
sudo -u omg npm install --legacy-peer-deps
cd server
sudo -u omg npm install
cd ..
sudo -u omg npm run build
sudo -u omg npm test

sudo systemctl start omg
sudo systemctl status omg
curl http://127.0.0.1:3001/api/health
```

После обновления проверить вход владельца и `/api/me` через публичный URL.

## 16. Восстановление доступа администратора

Если все глобальные администраторы потеряли доступ:

1. Закрыть внешний трафик к OMG или оставить доступ только из административной сети.
2. Остановить сервис.
3. Создать копию SQLite.
4. Проверить пользователей и восстановить нужную запись.
5. Запустить OMG и проверить доступ через SSH-туннель.
6. Только после этого вернуть внешний трафик.

Остановка и резервная копия:

```bash
sudo systemctl stop omg
sudo cp /var/lib/omg/omg.sqlite /var/backups/omg/emergency-before-access-fix.sqlite
```

Просмотр пользователей через установленный Node.js:

```bash
node <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/var/lib/omg/omg.sqlite');
console.table(db.prepare(`
  SELECT id, login, display_name, global_role, external_id, active
  FROM users
  ORDER BY login
`).all());
db.close();
NODE
```

Восстановление существующей корпоративной учётной записи владельца:

```bash
node <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/var/lib/omg/omg.sqlite');
db.prepare(`
  UPDATE users
  SET login = ?, external_id = ?, global_role = 'admin', active = 1
  WHERE id = ?
`).run('<OWNER_LOGIN>', '<OWNER_KEYCLOAK_SUB>', 'u-owner');
db.close();
NODE
```

Если записи ещё нет, создать её с уникальными `id` и `login`:

```bash
node <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/var/lib/omg/omg.sqlite');
db.prepare(`
  INSERT INTO users (
    id, login, display_name, global_role, external_id, active
  ) VALUES (?, ?, ?, 'admin', ?, 1)
`).run('u-owner', '<OWNER_LOGIN>', '<ФИО>', '<OWNER_KEYCLOAK_SUB>');
db.close();
NODE
```

Затем:

```bash
sudo chown omg:omg /var/lib/omg/omg.sqlite
sudo systemctl start omg
ssh -L 13001:127.0.0.1:3001 sysadmin@omg-server
```

Перед выполнением SQL подставить реальные значения и убедиться, что `login` не занят другой записью. Не редактировать SQLite при работающем сервисе.

## 17. Диагностика

Healthcheck, не требующий аутентификации:

```bash
curl http://127.0.0.1:3001/api/health
```

Логи приложения:

```bash
sudo journalctl -u omg -n 200 --no-pager
sudo journalctl -u omg -f
```

Основные случаи:

- `401 User is not active or does not exist` — proxy передал значение, которого нет среди активных `id`, `login` или `externalId`.
- Через `/api/me` открывается не тот пользователь — proxy передаёт другой claim либо несколько конфликтующих заголовков.
- Пользователь не видит проект — проверить его проектную роль в «Администрировании».
- Пользователь не видит «Отчёты» — требуется проектная роль `admin` либо глобальная роль `admin`.
- Нет «Администрирования» и «Заметок» — пользователь не является глобальным администратором.
- Через внешний URL открывается `u-admin` без Keycloak — немедленно закрыть внешний доступ и исправить reverse proxy/firewall.
- После изменения Keycloak username пропал доступ — обновить `login` в OMG либо использовать стабильный `sub` через `externalId`.

## 18. Финальный чек-лист ввода в эксплуатацию

- [ ] Node.js-порт `3001` недоступен из пользовательской сети.
- [ ] OMG доступен только по HTTPS через reverse proxy.
- [ ] Запрос без Keycloak-сессии не попадает в приложение.
- [ ] Внешние identity-заголовки удаляются или перезаписываются proxy.
- [ ] `/api/me` после входа владельца возвращает его корпоративную запись.
- [ ] У владельца `globalRole: "admin"` и `active: true`.
- [ ] Владелец видит все проекты, «Отчёты», «Администрирование» и «Заметки».
- [ ] Владелец подтвердил вход со своего рабочего компьютера.
- [ ] Создан второй глобальный администратор или согласована процедура аварийного восстановления.
- [ ] `OMG_DEV_USER_ID` удалён из production-конфигурации.
- [ ] Bootstrap-пользователь `u-admin` отключён после успешной проверки корпоративных администраторов.
- [ ] Создана и проверена резервная копия SQLite.
- [ ] Сисадмину передана эта инструкция и заполненные значения `<OWNER_...>`.

## 19. Что не хранить в GitLab

В репозитории хранится только код. Не коммитить:

- `server/omg.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`;
- `server/data.json` с рабочими данными;
- резервные копии;
- `.env` и `/etc/omg/omg.env`;
- Keycloak Client Secret;
- cookie secret `oauth2-proxy`;
- сертификаты и приватные ключи.

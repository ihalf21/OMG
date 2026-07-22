# OMG deployment guide

Инструкция для развёртывания OMG на корпоративном сервере.

## Что хранится в GitLab

В GitLab хранится только код приложения. Рабочие данные не коммитятся:

- `server/omg.sqlite`
- `server/omg.sqlite-wal`
- `server/omg.sqlite-shm`
- `server/data.json`
- `server/backups/`
- `.env*`

База проекта должна храниться на сервере отдельно от репозитория.

## Требования

- Node.js с поддержкой `node:sqlite`.
- npm.
- Доступ к GitLab-репозиторию.
- Каталог для данных приложения, доступный пользователю, под которым запускается Node.js.
- Reverse proxy с HTTPS: nginx, IIS, Traefik или корпоративный аналог.

Проверка `node:sqlite`:

```bash
node -e "require('node:sqlite'); console.log('sqlite ok')"
```

## Переменные окружения

Рекомендуемые переменные:

```bash
PORT=3001
OMG_SQLITE_PATH=/var/lib/omg/omg.sqlite
OMG_BACKUP_DIR=/var/backups/omg
```

Временная dev-переменная:

```bash
OMG_DEV_USER_ID=u-admin
```

Для production её лучше не использовать как основной механизм доступа. Пользователь должен приходить из Keycloak/reverse proxy.

## Ожидаемые заголовки от Keycloak / reverse proxy

Backend ищет пользователя по одному из заголовков:

- `x-omg-user-id`
- `x-auth-request-user`
- `x-auth-request-email`
- `x-forwarded-user`

Значение заголовка сопоставляется с пользователем в SQLite по:

- `id`
- `login`
- `externalId`

Практичный вариант для Keycloak:

- в `login` хранить корпоративный логин;
- в `externalId` хранить Keycloak subject;
- reverse proxy передаёт `x-auth-request-user` или `x-auth-request-email`.

## Первичная установка

```bash
git clone ssh://git@gl.rnd.lanit.ru:2222/DIT/omg.git
cd omg
npm install --legacy-peer-deps
cd server
npm install
cd ..
```

Сборка frontend:

```bash
npm run build
```

Проверка и инициализация SQLite:

```bash
npm run db:migrate
```

Запуск:

```bash
npm run server
```

Если папка `build/` существует, Express отдаёт и `/api/*`, и собранный frontend. Отдельный React dev-server на `4000` в production не нужен.

## Перенос текущей базы

С локальной машины перенести файл:

```txt
D:\Projects\OMG\server\omg.sqlite
```

На сервер положить, например:

```txt
/var/lib/omg/omg.sqlite
```

И выставить:

```bash
OMG_SQLITE_PATH=/var/lib/omg/omg.sqlite
```

Важно: переносить базу при остановленном приложении. Если приложение работает, сначала сделать backup через `npm run db:backup`.

## Резервное копирование

Команда:

```bash
npm run db:backup
```

По умолчанию backup пишется в:

```txt
server/backups/
```

Для сервера лучше задать:

```bash
OMG_BACKUP_DIR=/var/backups/omg
```

Рекомендуемый минимум для пилота: ежедневный backup и хранение нескольких последних копий.

## Проверка после запуска

Healthcheck:

```bash
curl http://localhost:3001/api/health
```

Проверка текущего пользователя:

```bash
curl http://localhost:3001/api/me
```

Проверка проектов:

```bash
curl http://localhost:3001/api/projects
```

Проверка frontend:

```bash
curl http://localhost:3001/
```

## Reverse proxy

Reverse proxy должен:

- завершать HTTPS;
- проксировать запросы на Node.js `http://127.0.0.1:3001`;
- пропускать `/api/*`;
- прокидывать заголовок пользователя после Keycloak-аутентификации.

Пример логики:

```txt
client -> HTTPS reverse proxy -> Keycloak auth -> Node.js OMG
```

## Обновление приложения

```bash
git fetch
git checkout main
git pull --ff-only
npm install --legacy-peer-deps
cd server
npm install
cd ..
npm run build
npm test
npm run db:backup
npm run server
```

На production-сервере запуск обычно должен быть оформлен через systemd, pm2, NSSM или другой корпоративный supervisor.

## Важные замечания

- `main` в GitLab считается стабильной веткой для развёртывания.
- Рабочая база не должна лежать внутри git.
- Перед обновлением делать backup SQLite.
- В production не запускать `npm run client`: это dev-server Create React App.
- Если пользователь видит не все проекты, проверить `project_members` через страницу `Администрирование`.

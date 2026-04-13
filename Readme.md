# 📦 GitHub Release Notifier

Сервіс для відстеження нових релізів у GitHub-репозиторіях з автоматичним сповіщенням електронною поштою.

---

## 🚀 Виконаний функціонал

- [x] Сервіс реалізовано на **Node.js + Express** з використанням **TypeScript**
- [x] Повна відповідність опису API
- [x] API, Scanner та Notifier об'єднані в межах одного сервісу
- [x] Усі дані зберігаються в **базі даних**
- [x] Автоматичне виконання міграцій при запуску сервісу
- [x] **Dockerfile** + **docker-compose.yaml** для stage-запуску
- [x] Додаткові `dockerfile.dev` + скрипти `npm run docker-build:dev` / `docker-run:dev` для розробки
- [x] Регулярна перевірка нових релізів для всіх активних підписок
- [x] Перевірка існування репозиторію через **GitHub API** + додаткова валідація при створенні підписки
- [x] Обробка помилок зовнішнього API
- [x] **Unit tests**

---

## ✨ Додаткові завдання

- [x] **Деплой**
- [x] **GitHub CI** (lint + tests)
- [x] **Integration tests**
- [x] **UI**
- [x] **Basic healthcheck**
- [x] **begin make JWT Auth** 

---

## 🐳 Запуск проєкту за допомогою Docker Compose

1. Створіть файл `.env` та заповніть його за зразком із `.env.example`
2. Обов’язково вкажіть **SMTP credentials** (наприклад, Google SMTP)
3. У терміналі виконайте:

```bash
docker-compose up --build
```

## 🛠 Запуск у режимі розробки (dev)
Перед запуском підніміть локальну базу даних (Docker або pgAdmin)

Виконайте команди:

```bash
npm install --force
npm run docker-build:dev
npm run docker-run:dev
```

## Frontend
[UI for the task](https://fe-n8va.onrender.com/)

## COMMENTS

Я встиг почати реалізовувати логіку роботи з сесіями та refresh tokens у таблицях sessions і refresh_tokens, але вона не використовується повністю. Оскільки в мене було лише трохи менше двох днів на реалізацію, то я б узяв це за основу і добудував JWT. По-перше, я б додав два ендпоїнти — /login і /refresh. При логіні перевіряю email/password (треба додати bcrypt для хешування паролів, бо зараз там тимчасовий tempPassword), генерую access token (на 15 хвилин) і refresh token (на 7 днів). Refresh token зберігаю в БД у таблиці refresh_tokens або sessions, та хешую його перед збереженням. Access token кладу в Authorization: Bearer або в httpOnly cookie — я б обрав cookie для кращого захисту від XSS. При запиті на /refresh перевіряю refresh token, видаю нову пару токенів, а старий refresh token анулюю (token rotation). Для logout просто видаляю refresh token із БД.

У проекті також порібно робити багато рефакторингу, зокрема винести запити в окрему директорію, винести код в окремі функції, щоб можна було збергти читабельність коду.

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

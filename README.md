# StudyTrack Mobile App

A fully functional, offline-first academic organizer built with **Expo SDK 57 + React Native + SQLite**.

---

## 📱 App Features

| Feature | Description |
|---|---|
| **Onboarding / Auth** | Responsive 3-slide intro → register / username login / guest demo mode |
| **Academic Period** | Manage terms (First/Second Semester, Summer) & Academic Years with term isolation |
| **Dashboard** | Weekly progress ring, focus timer with selectable alarm sound, deadlines, today's schedule & GPA preview |
| **Grade Monitoring** | Raw scores, total items, assessment weights, GPA calculations & What-If simulator |
| **Task Management** | CRUD tasks, priority filters, search, subject linking, optional scores that can be added later |
| **Study Calendar** | Month view with deadline dots, daily agenda, class slots |
| **Weekly Timetable** | Mon–Sun schedule grid, add/edit/delete class slots, course directory |
| **Floating Action Menu** | Quick-access button in lower-right corner for fast student actions |
| **Student Profile** | Edit info, avatar color, academic goals, term switcher, dark mode toggle |
| **AI Tutor** | On-device Gemma or cloud Gemini chat assistant |
| **Notifications** | In-app notification center plus weekly Android class reminders scheduled one hour ahead |
| **Persistence** | All data stored in SQLite via expo-sqlite (works offline) |

---

### Android local notifications

Class reminders and focus alarms are scheduled on-device, so they do not need a network connection and can appear while StudyTrack is closed. Allow notifications when Android prompts; reminders follow the saved weekly class timetable. The selected focus-alarm sound and notification channels are native resources, so rebuild the Android development app after changing notification assets or configuration. Android force-stop and device battery restrictions can still prevent background delivery.

---

## 🛠️ Tech Stack

- **Framework**: Expo SDK 57 (Bare workflow / CNG)
- **Language**: TypeScript
- **Navigation**: expo-router (file-based)
- **Database**: expo-sqlite (SQLite, offline-first)
- **State**: React Context (AuthContext + StudyContext)
- **Icons**: @expo/vector-icons (Ionicons)
- **Charts**: react-native-svg (progress ring)
- **AI**: react-native-litert-lm (on-device Gemma) + Gemini cloud API

---

## ⚡ Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| Java | 17 (OpenJDK) |
| Android Studio / SDK | API 35+ |
| Expo CLI | included via `npx` |

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

```bash
cp .env.example .env
# Edit .env to add your Gemini API key for cloud AI features
```

### 3. Run on Web (Dev Preview)

```bash
npx expo start --web
```

Open [http://localhost:8081](http://localhost:8081) in your browser.

### 4. Run on Android

#### Option A — Expo Dev Client (recommended)

```bash
# First time only: prebuild native project
npx expo prebuild --platform android --clean

# Connect device or start emulator, then:
npx expo run:android
```

#### Option B — Build APK

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🏗️ Project Structure

```
src/
├── app/
│   ├── _layout.tsx              # Root navigator (Auth gate, providers)
│   ├── onboarding.tsx           # Intro + login/register screen
│   ├── settings.tsx             # App settings
│   └── (tabs)/
│       ├── _layout.tsx          # Floating pill tab bar
│       ├── index.tsx            # Dashboard (home)
│       ├── tasks.tsx            # Task management
│       ├── calendar.tsx         # Study calendar
│       ├── schedule.tsx         # Weekly timetable
│       ├── grades.tsx           # Academic Performance & Grade Monitoring
│       ├── profile.tsx          # Student profile & preferences
│       └── chat.tsx             # AI Study Tutor
├── components/
│   ├── AcademicPeriodModal.tsx  # Semester & Academic Year switcher
│   ├── FloatingQuickAction.tsx  # Floating quick-access action button
│   ├── FloatingTabBar.tsx       # Custom floating tab bar
│   ├── ProgressRing.tsx         # SVG circular progress ring
│   └── ...
├── context/
│   ├── AuthContext.tsx          # Student session management
│   └── StudyContext.tsx         # Global study data & grade calculations
├── db/
│   ├── client.ts                # SQLite connection & migrations
│   └── studytrack.ts            # DB models & CRUD operations
├── settings/
│   └── SettingsContext.tsx      # App preferences
└── theme.ts                     # Light / Dark theme tokens
```

---

## 🗄️ Database Schema

All tables live in `chat.db` (SQLite). Migrations run automatically on first launch.

| Table | Purpose |
|---|---|
| `users` | Student accounts (email, username, name, major, institution) |
| `academic_periods` | Semester & Academic Year records (`is_active` flag) |
| `subjects` | Course catalog (name, code, color, credits, target grade, passing grade) |
| `assessments` | Scores & weights (raw score, total items, weight %, category) |
| `tasks` | Study assignments (title, due date, priority, status) |
| `schedules` | Weekly class timetable (day, time, location, type) |
| `study_sessions` | Focus timer logs (duration, subject, date) |
| `notifications` | In-app alerts (title, message, type, read status) |
| `study_goals` | Weekly hour targets & daily task targets |

---

## 🔐 Authentication

The app uses **local SQLite authentication** (offline-first):

- Passwords are stored in the local database (suitable for a personal, offline student app)
- Sessions are persisted with `expo-secure-store` (native) or `localStorage` (web)
- New accounts choose a username for sign-in; existing accounts can use their email or the email's local part as their migrated username
- For production with multi-device sync, integrate **Supabase Auth** or **Firebase Auth**

**Demo Account**: Tap "Explore Demo as Guest" on the onboarding screen to auto-login as *Alex Rivera* with 4 pre-seeded courses, tasks, and a weekly timetable.

---

## 🧪 Verification Commands

```bash
# TypeScript type check
npx tsc --noEmit

# ESLint
npx expo lint

# Dependency health check
npx expo-doctor

# Prebuild (generates android/)
npx expo prebuild --platform android --clean

# APK build (ARM64 optimized)
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

---

## 🌍 Build Environment Variables

For native Android builds, configure your shell:

```bash
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
export SKIP_IOS_FRAMEWORK_DOWNLOAD=1  # Android-only builds
```

---

## 📦 EAS Cloud Build (Optional)

For CI/CD builds without local Android SDK:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

---

## 🚫 Known Limitations

| Limitation | Notes |
|---|---|
| No push notifications | Expo Notifications can be added for deadline alerts |
| Single-device storage | Data lives in on-device SQLite; add Supabase for sync |
| Password not hashed | Suitable for personal use; use bcrypt + Supabase for production |
| No file attachments | expo-document-picker is included and can be wired up |

---

## 🎨 Design System

| Token | Light | Dark |
|---|---|---|
| Primary | `#4F46E5` (Indigo 600) | `#6366F1` (Indigo 500) |
| Secondary | `#7C3AED` (Purple 700) | `#A78BFA` (Purple 400) |
| Success | `#10B981` (Emerald) | `#34D399` |
| Warning | `#F59E0B` (Amber) | `#FBBF24` |
| Danger | `#EF4444` (Red) | `#F87171` |

---

*StudyTrack v1.0.0 — Built with Expo SDK 57 & React Native*

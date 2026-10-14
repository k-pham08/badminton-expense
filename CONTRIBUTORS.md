# Contributors

## Primary Maintainer

| Name | Role | Contact |
|------|------|---------|
| Khoa Pham | Owner & Developer | [@k-pham08](https://github.com/k-pham08) |

---

## Project Overview

**Badminton Expense** is a mobile app for tracking badminton court fees, shuttlecock costs, and attendance across playing sessions. It supports:
- Monthly expense tracking per member
- Court and time slot management
- Zalo integration for attendance/vote import
- Local data backup and restore

---

## Development Guidelines for AI Agents

### Before Writing Code

1. **Read Expo v57 docs**: https://docs.expo.dev/versions/v57.0.0/
2. **Run GitNexus analysis**: `npx gitnexus analyze`
3. **Check architecture**: See `ARCHITECTURE-DECISION-RECORD.md`

### Code Standards

| Rule | Reason |
|------|--------|
| Use TypeScript strictly | Type safety for financial calculations |
| No external state management | React Context + AsyncStorage is sufficient |
| Keep screens under 300 lines | Extract logic to utils/components |
| Add unit tests for utils | Critical for calculation correctness |
| Test on both iOS and Android | Ensure cross-platform compatibility |

### Commit Standards

1. Run `gitnexus_detect_changes()` before committing
2. Follow conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
3. Include issue number if applicable

### File Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # Full-screen views
├── store.tsx      # Global state (single source of truth)
├── types.ts       # TypeScript interfaces
├── utils/         # Pure functions (calculations, dates, etc.)
└── theme.ts       # Design tokens
```

### State Management Pattern

- **Single store**: All app state in `store.tsx` using React Context
- **AsyncStorage persistence**: Auto-save on every state change
- **No API calls**: Fully offline-first

### Zalo Integration

- Bridge tool runs on Mac to read Zalo web cookies
- Vote data imported via clipboard or direct sync
- Member-to-Zalo-name mapping for attendance matching

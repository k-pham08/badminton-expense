# Architecture Decision Record (ADR)

## ADR-001: Expo Framework Choice

**Date**: 2024-01-01  
**Status**: Accepted

### Context

Need a cross-platform mobile app (iOS/Android) for tracking badminton expenses. Team has web development experience but limited native mobile experience.

### Decision

Use **Expo SDK 57** with React Native 0.86.

### Rationale

- Faster development with managed workflow
- No native code required for most features
- Prebuild option for when native access is needed
- Good TypeScript support out of the box
- Familiar React ecosystem

### Consequences

- **Positive**: Faster iteration, web-like development experience
- **Negative**: Less control over native configuration
- **Mitigation**: `npx expo prebuild` when native access needed (now done for iOS/Android builds)

---

## ADR-002: State Management

**Date**: 2024-01-01  
**Status**: Accepted

### Context

Need to manage complex nested state: members, courts, months, sessions, attendees, payments.

### Decision

**React Context + useReducer** for state management with **AsyncStorage** for persistence.

### Implementation

```typescript
// Single AppContext wrapping all state
const StoreContext = createContext<Store | null>(null);

// Auto-persist on every state change
useEffect(() => {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}, [data]);
```

### Rationale

- Simplicity: No external libraries needed
- Predictability: Single source of truth
- Debugging: State changes are traceable
- Performance: Context is sufficient for this app's complexity

### Consequences

- **Positive**: Zero dependencies, easy to understand, easy to persist
- **Negative**: Potential re-render issues if not careful (mitigated with useMemo)
- **Limit**: Not suitable if app grows much larger

---

## ADR-003: Data Schema

**Date**: 2024-01-01  
**Status**: Accepted

### Context

Need to store expense data that supports:
- Multiple months with different configurations
- Variable number of sessions per month
- Per-member attendance and payment tracking
- Court and time slot management

### Decision

```typescript
type AppData = {
  version: 1;  // Schema version for migrations
  members: Member[];
  zaloContacts: ZaloContact[];
  courts: Court[];
  months: Record<string, MonthData>;
};
```

### Key Design Choices

1. **Flat structure**: Sessions stored by date string key
2. **Computed playing dates**: Based on weekdays, skipped/extra dates
3. **Optional attendee hours**: Defaults to full session duration
4. **Zalo name mapping**: Allows flexible name matching

### Consequences

- **Positive**: Easy to serialize/deserialize, flexible date-based lookup
- **Negative**: Need to handle schema migrations for future versions

---

## ADR-004: Cross-Platform Build Strategy

**Date**: 2025-10-15  
**Status**: Accepted

### Context

Need reproducible builds for iOS TestFlight and Android APK distribution.

### Decision

1. **iOS**: Use `expo run:ios --configuration Release` with Xcode
2. **Android**: Use `expo prebuild` + Gradle build
3. **CI/CD**: Store native projects in Git (excluding build artifacts)

### Implementation

```
# .gitignore exclusions
/android/build/
/android/.gradle/
/android/app/build/
/android/app/.cxx/
/ios/build/
/ios/.xcode.env.local
```

### Consequences

- **Positive**: Native projects versioned, reproducible builds
- **Negative**: Larger repo size, need to update prebuild on dependency changes

---

## ADR-005: Zalo Integration Strategy

**Date**: 2024-06-01  
**Status**: Accepted

### Context

Users want to import attendance/vote data from Zalo group chats. Zalo doesn't provide official API.

### Decision

**Local bridge tool** running on Mac that:
1. Reads Zalo web cookies from browser
2. Scrapes vote sheet data
3. Exposes data via local HTTP server

```typescript
// Mobile app connects to bridge
GET http://<mac-ip>:3000/vote-sheets
```

### Rationale

- Official API unavailable
- Cookie-based approach respects user privacy (user controls their own data)
- Works with existing Zalo web interface

### Consequences

- **Positive**: No backend required, privacy-preserving
- **Negative**: Requires Mac to be on same network, manual cookie setup

---

## ADR-006: Financial Calculation Approach

**Date**: 2024-01-01  
**Status**: Accepted

### Context

Expense calculations must be accurate for money-sharing among friends.

### Decision

**Pure utility functions** in `utils/calc.ts` with comprehensive unit tests.

### Key Formulas

```typescript
// Per-person cost = (court_fee + shuttle_cost) / attendee_count
// Court fee = sum of (court_hours × price_per_hour)
// Shuttle cost = base_count × price + extra_count × price

function personShare(
  session: Session,
  month: MonthData,
  personId: string
): number {
  const courtFee = totalCourtFee(session.courts);
  const shuttleFee = totalShuttleFee(session, month);
  const total = courtFee + shuttleFee;
  const attendeeHours = getAttendeeHours(session, personId);
  return (total * attendeeHours) / totalAttendeeHours(session);
}
```

### Consequences

- **Positive**: Testable, auditable, no hidden state
- **Negative**: Must be careful with floating-point (use integer cents internally)

---

## Future Considerations

| Area | Notes |
|------|-------|
| Cloud sync | May add Firebase/Supabase if multi-device needed |
| Server-side | Not needed currently (offline-first works) |
| Web app | Expo web support exists but not priority |
| Desktop | Electron wrapper possible but not planned |

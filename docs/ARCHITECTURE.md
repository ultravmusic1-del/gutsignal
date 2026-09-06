# GutSignal — Architecture

The shape of the system, in pictures. `CLAUDE.md` §47 expects this file; it had never been
written, and the review asked for the diagrams.

**This is deliberately thin.** The reasoning lives where it belongs and is not repeated here: the
schema and threat model in [PROJECT_PLAN.md](PROJECT_PLAN.md), the analysis method in
[PATTERN_ENGINE.md](PATTERN_ENGINE.md), the data protections in
[PRIVACY_SECURITY.md](PRIVACY_SECURITY.md), and every decision in [DECISIONS.md](DECISIONS.md).
Duplicating any of it here is how five documents come to disagree, which is the problem
[PROJECT_STATUS.md](PROJECT_STATUS.md) exists to stop.

---

## 1. The layers

Dependencies point one way. `domain` knows nothing about React, Supabase or SQLite, which is what
makes the pattern engine testable without any of them — and portable to an Edge runtime later
(risk R-09).

```mermaid
flowchart TD
    A["app/<br/><i>Expo Router screens</i>"] --> B["src/features/<br/><i>hooks, flows, ports</i>"]
    B --> C["src/domain/<br/><i>pure logic — engine, export, reports</i>"]
    B --> D["src/services/<br/><i>SQLite, Supabase, sync, auth</i>"]
    D --> C
    E["src/components/ui<br/>src/theme"] --> A

    style C fill:#e8e2f5,stroke:#5b4b8a,stroke-width:2px
    style D fill:#fdf0e3,stroke:#a86f3c
```

The rule worth stating: **`domain` never imports from `services` or `features`.** A repository is
handed to it, never reached for. Every failure path in the engine, the export flow and account
deletion is testable because of that one constraint.

---

## 2. Writing a log — the offline path

The UI never waits on the network. A log is durable before anything is sent, which is the whole
of `CLAUDE.md` §15.

```mermaid
sequenceDiagram
    participant U as User
    participant S as Screen
    participant R as Repository
    participant Q as Outbox
    participant E as Sync engine
    participant P as Supabase

    U->>S: saves an entry
    S->>R: write (device-generated UUID)
    R->>Q: enqueue, status = pending
    R-->>S: done
    S-->>U: entry visible immediately

    Note over E,P: later, and never on the UI's critical path
    E->>Q: claim a batch (50)
    E->>P: upsert on the device's id
    P-->>E: accepted
    E->>Q: mark synced
```

The id comes from the device, so a retry after an ambiguous timeout **updates** the row it already
created rather than creating a second one. Nothing leaves the outbox until the server confirms it.

---

## 3. Reading changes back — the pull

```mermaid
flowchart LR
    A["cursor<br/>(updated_at, id)"] --> B["fetch strictly after it<br/>ORDER BY updated_at, id<br/>LIMIT 200"]
    B --> C{"merge"}
    C -->|"unpushed local edit"| D["keep local"]
    C -->|"remote is newer"| E["apply remote"]
    C -->|"remote is older or equal"| D
    E --> F["advance cursor to<br/>the LAST row of the page"]
    F --> A

    style A fill:#e8f0e8,stroke:#4a6b4a
```

Two things are load-bearing and both were defects once. The cursor is a **pair**, because
`updated_at` is a transaction timestamp and a tie group wider than a page could never be paged past
(ADR-0043). And it advances to the last row **in cursor order**, not the largest timestamp — taking
the maximum was the defect itself.

A page that fails to apply leaves the cursor where it was, so it is retried rather than skipped
(ADR-0045).

---

## 4. From a diary to a finding

Deterministic end to end. No clock, no randomness, no model.

```mermaid
flowchart LR
    L["local logs"] --> D["days<br/><i>user's local calendar</i>"]
    D --> F["candidate factors"]
    D --> O["observations<br/><i>observed / good / unknown</i>"]
    F --> O
    O --> C["compare<br/><i>rates, means, interval</i>"]
    C --> X["confounders"]
    X --> K["confidence<br/><i>minimum of five</i>"]
    K --> S["status<br/><i>one of five</i>"]
    S --> B["breadth correction"]
    B --> N["Finding"]

    style N fill:#e8e2f5,stroke:#5b4b8a,stroke-width:2px
```

**An LLM may explain a finding. It may never produce one** (`CLAUDE.md` §18). Nothing in this
path touches a network.

Findings are **recomputed from local logs** on every open rather than read back, so Insights works
offline and can never show a conclusion the user's own diary no longer supports.

---

## 5. Where the secrets are, and are not

```mermaid
flowchart TD
    subgraph device["iPhone — everything here is readable by anyone who downloads the app"]
        A["EXPO_PUBLIC_ values<br/>publishable key only"]
        B["SecureStore<br/><i>session tokens</i>"]
    end

    subgraph edge["Edge Function — the only place a secret lives"]
        C["SUPABASE_SERVICE_ROLE_KEY"]
    end

    subgraph db["Supabase"]
        D["Postgres + RLS"]
        E["auth.users"]
    end

    A -->|"anon / authenticated"| D
    B -->|"JWT"| D
    A -->|"invoke, with the caller's JWT"| C
    C -->|"deletes the caller only"| E
    E -->|"ON DELETE CASCADE"| D

    style C fill:#fde8e8,stroke:#a33
```

The delete endpoint **takes no user id**. It reads the caller's id from the verified token, so
there is no capability to aim it at anyone else — an authorisation check can be removed by
accident, a capability that was never built cannot (T13, ADR-0042).

---

## 6. What is not in these diagrams

Because it does not exist yet: Experiments, Ask My Gut, RevenueCat, HealthKit, meal photos and any
AI provider. When one arrives, it belongs on the diagram it changes and in
[DECISIONS.md](DECISIONS.md) — and if it moves a boundary in §5, in the threat table too.

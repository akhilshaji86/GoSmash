# GoSmash

Very low-cost V1 for personal badminton match recording, player stats, and leaderboards.

## What Is Built

- Angular 21 single-page app.
- Individual player profile stored locally for the V1 prototype.
- Registered-player picker built from the current profile, leaderboard, and saved match participants.
- Hosted game creation with locality, time, required player count, visible open/full games by locality, join notifications, request cancellation, host approval/rejection notes, mark-full/reopen, and game cancellation.
- Dashboard with matches played, wins, win rate, point diff, mistake rate, and suggestions.
- Start Match flow for singles or doubles from approved hosted-game players.
- Separate dashboard, create, record, insights, and account routes.
- Quick one-tap scoring for side plus shot type, with the older two-step scorer kept as Classic mode.
- Court-first point recording with undo, wide court toggle, and automatic finalization.
- Image-backed badminton court scorer with live server and receiver highlights.
- Singles court view shows one player per side and moves the player marker by even/odd service court.
- Compact rally actions for Point, Smash, Drop Shot, Clear, Net Shot, Lob, and Fault.
- Opponent-mistake stats when no shot type is selected, without showing mistake text in the point feed.
- Badminton scoring rules: rally scoring, deuce, win by two, and 30-point cap for standard 21-point games.
- Opening side/server selection, doubles server/receiver setup, stronger server/receiver highlighting, and service-side/service-court tracking.
- Match-won banner and court glow animation when the winning point is recorded.
- Shot profile insights show scoring-shot mix percentages instead of won/lost rows per shot type.
- Global leaderboard for the current prototype.
- Elo-style rating calculation from completed matches.
- Local demo repository that runs immediately without cloud cost.
- Supabase/Postgres migration for the production backend path.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:4200`.

The app currently uses `localStorage` through `LocalMatchRepository`. The UI depends on the `MatchRepository` interface, so switching to a Supabase adapter later does not require rewriting the screens.

## Production Path

1. Create a Supabase project.
2. Run `supabase/migrations/0001_match_recording.sql`.
3. Add a Supabase repository implementation behind `MATCH_REPOSITORY`.
4. Keep the current Angular app and domain models unchanged.

The migration uses normalized profile, player, game-session, join-request, approved-player, match, participant, point-event, and leaderboard tables. The game-session functions support host-created locality games, player join requests, and host approval before match creation. The `record_point` function stores shot type or opponent-mistake metadata, service side/court metadata, applies badminton final-score rules, and finalizes the match atomically when the winning point is recorded. The `set_opening_server`, `swap_opening_players`, `record_point`, and `finalize_match` functions are atomic Postgres operations so concurrent score updates cannot corrupt a match.

## Cost Target

For this V1 scope, the app can be run at near-zero cost during local/pilot testing. A small production setup with Supabase Pro and Cloudflare Pages should fit roughly in the `Rs 2,500-Rs 4,000/month` range before SMS, custom domain, or support tooling.

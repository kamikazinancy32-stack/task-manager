# Task Manager

A Node.js task manager with both an interactive CLI and a browser-based demo. The CLI remains the default `npm start` experience; the website runs separately.

## Run locally

Requires Node.js 18 or newer.

```powershell
npm install
npm test
npm start
```

The CLI supports `help`, `all`, `completed`, `pending`, `overdue`, `priority [high|medium|low]`, `sort`, `search <word>`, `user <id>`, `users`, `complete <id>`, `summary`, and `exit`.

In another terminal, start the website:

```powershell
npm run web
```

Open [http://localhost:3000](http://localhost:3000). The web server uses `PORT` when supplied by a host and binds to `0.0.0.0`.

## Website behavior

The website reuses the existing API client, task models, and task-processing functions. JSONPlaceholder supplies the sample tasks and users; priority and due dates are derived locally by the existing project logic because the sample API has no such fields. JSONPlaceholder's task titles are Lorem Ipsum placeholder text, so the website and the CLI replace each one with an English title chosen from the task ID (`titles.js`); the same task always gets the same title, and titles that are already English are left unchanged. Completion changes are held in server memory, shared by visitors to the same running instance, and reset whenever that instance restarts or redeploys. These demo changes are not saved to JSONPlaceholder.

## Deploy on Render

The included `render.yaml` is a Render Blueprint for a Node web service. To deploy through the dashboard:

1. Push this repository to GitHub after reviewing the changes.
2. Open [Render Dashboard](https://dashboard.render.com), sign in, and choose **New** > **Web Service**.
3. Connect GitHub if requested, then select `kamikazinancy32-stack/task-manager` and branch `main`.
4. Set the build command to `npm install` and the start command to `npm run web`. Select the **Free** compute plan for a no-compute-cost demo, or select a paid plan if you need it to stay responsive.
5. Choose **Create Web Service**, wait for the deploy to finish, then open its `onrender.com` URL. Verify the page and `/api/tasks` both load.

Render's free web services currently spin down after 15 minutes without traffic and can take about a minute to wake; the free allowance is 750 instance hours per workspace per month. The free filesystem is ephemeral. The task completion state is already in memory, so it resets on restarts, spin-downs, and redeploys. Current Render compute pricing lists a small paid web-service plan at $7/month; confirm the current price and plan details in Render before selecting a paid option. See [Render web services](https://render.com/docs/web-services), [free instance limitations](https://render.com/docs/free), and [pricing](https://render.com/pricing).

No credentials or environment variables are required. Do not add secrets to this repository. Publishing changes to GitHub does not itself deploy the service unless a Render service has been connected to the repository.

This policy explains what information CrossPoint collects, why, who we share it with, and how to get it deleted. We've tried to keep it short and specific. If anything here is unclear, [get in touch](/contact).

## What this policy covers

- **crosspointreader.com**: this website, including the browser flasher, font and theme tools, nightly builds, the contact form, and the issue form.
- **CrossPoint Sync**: the hosted sync service at **sync.crosspointreader.com** and the CrossPoint Sync app.

CrossPoint Sync is open-source software that anyone can run. If you use a sync server run by someone else, or one you host yourself, that server's operator controls your data and this policy doesn't apply to it.

## The short version

- We don't sell your data, show ads, or build advertising profiles.
- The website uses privacy-focused, cookie-free analytics.
- CrossPoint Sync stores your reading data so it can sync it. That's the whole point of the service, and you can delete all of it from your account settings at any time.
- Passwords and service credentials are stored hashed or encrypted, never in plain text.

## The website

### Analytics

We use [Fathom Analytics](https://usefathom.com) to count page views and a few events, like "firmware flashed to an Xteink X4." Fathom doesn't use cookies and doesn't collect personal information. We also keep a simple counter of how many times each kind of device has been flashed from the site. It records the device model and firmware channel, nothing about you.

### Flashing and the browser tools

The browser flasher talks to your device directly over USB from your browser. Your device's contents aren't uploaded to us. Firmware downloads come from our servers or from GitHub.

The **SD-card font builder** converts your fonts entirely in your browser. The font files you pick are never uploaded; the only thing downloaded is the set of bundled fallback fonts the converter needs.

If you use **custom font firmware** or **custom builds**, the files you upload are sent to our build system, which runs on GitHub Actions, so we can compile them into firmware. To track your build, we set a cookie called `cp_uid`. It holds a random ID that isn't linked to your name or email, and it lasts up to a year.

### Contact form

When you send a message, we receive your name, email address, and message. It's delivered to the team by email and to our team chat on Google Chat. We use it only to reply to you.

### Issue form

The [Report an Issue](/report-issue) form creates a **public** GitHub issue from your title, description, and anything you attach, such as a serial log. Don't include anything you wouldn't want public.

- If you give an email address, it **does not** go in the public issue. We keep it in a private admin log (the 500 most recent submissions) so we can follow up with you.
- We use [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) to block bots. Turnstile may process information about your browser to make that check.
- Your IP address is briefly stored for about two minutes to limit how often one person can submit.
- Issue text is processed by an AI model on Cloudflare's network to spot duplicate reports.

### Sync account sign-up page

The [sync registration page](/kosync) sends the username and password you choose to the sync server you pick, which is CrossPoint Sync by default. We pass them through without storing them.

### Nightly builds sign-in

Nightly builds are for project supporters. When you sign in, your email address is sent to [Royalty](https://royalty.dev), our funding platform, so it can check whether you're a supporter and email you a sign-in link.

## CrossPoint Sync

### Your account

- **Sync account:** the username you choose and your password. Readers using the KOReader sync protocol send a hashed version of your password. We store a salted hash of that (PBKDF2), not the password itself.
- **Web account:** a handle you choose and a salted hash of your login token. We don't ask for your real name or email to create an account.
- **Sign-in:** the website uses a signed session cookie (`cp_session`) that keeps you signed in for up to 30 days. The app stores your sign-in on your device.

### Your reading data

Storing and syncing this data is how the service works:

- **Books:** an ID for each book (a fingerprint your reader calculates), plus the title, author, file name, and file size your device reports. We don't store the books themselves.
- **Progress:** your position in each book, which device it came from (the device name and an ID your reader generates), and a history of position changes over time. We use that history for stats and to resolve conflicts between devices.
- **Bookmarks and highlights:** bookmark locations and snippets, highlighted passages, and any notes you write.
- **Reading stats:** reading time, pages, streaks, and daily totals your devices send, plus reading status, start and finish dates, and anything you edit yourself.
- **Book details:** covers, page counts, series, genres, and descriptions that we look up for your books.

### Book details lookups

To find covers and book details, the server sends a book's **title and author**, and nothing that identifies you, to Apple's iTunes Search, Open Library, Google Books, Hardcover, and SearchAPI (which searches Amazon). Results are cached and shared across all users so each book is looked up as rarely as possible.

### Connected services

You can link services like Hardcover, Readwise, Readwise Reader, Micro.blog, Audiobookshelf, BookFusion, BookOrbit, Spotify, Amazon Kindle, or another KOReader sync server. When you do:

- We store the credential needed to access that service (an access token, app token, or login), **encrypted** with AES-256-GCM. Some services also give us a display name or email for the account, which we show so you can tell which account is linked.
- We send that service what it needs to do the job you asked for, such as reading progress, finished books, or highlights. Some services also send data back to us, like listening position from Spotify or reading position from Kindle.
- Your use of each connected service is governed by that service's own privacy policy.

**Kindle:** linking registers CrossPoint as a Kindle device on your Amazon account. Your Amazon password and the verification code Amazon emails you are used only to complete that registration and are never stored or logged. We keep only the device credential Amazon issues, encrypted. You can remove it from Amazon's "Manage Your Content and Devices" page at any time.

### Logs and abuse protection

The server checks your IP address in memory to rate-limit sign-ups. It isn't written to our database. Our hosting providers may keep standard technical logs, such as IP addresses and request times, for a limited period.

## Who we share data with

We share data only with the services that run CrossPoint, and only as described above:

- **Hosting and infrastructure:** Cloudflare (the website, file storage, email, bot checks, AI processing) and Railway (CrossPoint Sync).
- **GitHub:** firmware builds and public issues.
- **Fathom:** website analytics.
- **Google Chat:** delivers contact form messages to the team.
- **Royalty:** checks supporter status for nightly builds.
- **Book details providers:** receive titles and authors only.
- **Services you connect:** receive the data needed for the connection you set up.

We may also share information if the law requires it, or to protect the safety of our users or the service.

## How long we keep it

- **Sync data** stays until you delete it, or until we close the account under our [Terms](/terms).
- **Contact messages** stay in the team's email and chat for as long as we need them to help you.
- **Issue form emails** stay in the admin log until 500 newer submissions push them out. Public GitHub issues stay on GitHub.
- **Build files** are kept only as long as the build system needs them.

## Your choices and rights

- **Delete your sync data:** in your CrossPoint Sync account settings you can delete just your reading data, your sync account and all its data, or your whole account. Deletion is permanent.
- **Disconnect a service:** unlinking a service deletes the credential we stored for it.
- **Ask us:** to get a copy of your data, correct it, or have it deleted, [contact us](/contact). Depending on where you live (for example, the EU, UK, or California), you may have legal rights to access, correct, delete, or move your data, or to object to how we use it. We'll honor those requests no matter where you live.

## Security

We hash passwords, encrypt service credentials, and use HTTPS. No system is perfectly secure, though, so please use a unique password for your sync account.

## Children

CrossPoint isn't directed at children under 13, and we don't knowingly collect their personal information. If you think a child has given us personal information, contact us and we'll delete it.

## Changes

If we change this policy, we'll update the date at the top. If a change is significant, we'll also announce it on the site or in CrossPoint Sync.

## Contact

Questions about privacy? Email [hello@crosspointreader.com](mailto:hello@crosspointreader.com) or use our [contact page](/contact).

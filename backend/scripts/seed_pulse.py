#!/usr/bin/env python
"""Add ~6 weeks of simulated student activity for Campus Pulse (local/demo only).

Adds ~90 fictional students with realistic posts across the feed, public clubs
and the anonymous board, following a plausible semester (registration chaos,
orientation, shuttle bus, library Wi-Fi, career fair, dorm heating...). Also
plants privacy edge cases the report must handle:
  - parking complaints ONLY in a private club, DMs and club chat (must never appear)
  - a printer problem from just a few students (must stay below the threshold)
  - a grading complaint naming a professor (may appear, but never the name)

Fictional students use a non-deliverable email domain and an unknown random
password, so no email can reach a real person and nobody can log in as them.
Additive: run after seed_demo.py. --force removes previous pulse data first.

    docker compose exec backend python scripts/seed_pulse.py --force
"""
import asyncio
import random
import secrets
import sys
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, "/app")

from sqlalchemy import delete, or_, select

from app.config import settings
from app.core.pulse.collect import last_completed_week
from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.chat_message import ChatMessage
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.conversation import Conversation
from app.models.direct_message import DirectMessage
from app.models.post import Post
from app.models.pulse_report import PulseReport
from app.models.user import User

DOMAIN = "pulse.demo.invalid"   # .invalid is reserved: mail to it can never be delivered
WEEKS = 6
rng = random.Random(2026)       # fixed seed: the same dataset every run


def assert_local():
    if settings.environment.lower() == "production":
        sys.exit("REFUSING: ENVIRONMENT=production.")
    url = settings.database_url
    host = url.split("@")[-1].split("/")[0].split(":")[0] if "@" in url else ""
    if host not in ("postgres", "localhost", "127.0.0.1", "db"):
        sys.exit(f"REFUSING: database host {host!r} is not local.")


# ── people ────────────────────────────────────────────────────────────────────

FIRST = """Adnan Alma Amar Amra Anes Arijana Belma Benjamin Dalila Dino Edin Elma Emina Enes Esma
Haris Ilma Irma Jasmin Kenan Lamija Medina Merima Naida Nejra Nermin Rijad Sanel Selma Semir Vedad
Zehra Ahmet Ayşe Burak Elif Emre Zeynep Mehmet Yusuf Fatima Kerim Ilhan Adna Ajdin Hamza Malik Samir
Ines Lana Mia Amina Dženana Faris Harun Ismar Lejla Naim Sumeja Tarik Una Vildana Zlatan Aldin Berina
Darija Emir Hana Ibrahim Kanita Lamia Mahir Neira Orhan Ramiz Sara Tea Mustafa Ena Arman Nadira""".split()
LAST = """Hodžić Mujić Delić Karić Bešlić Hasanović Softić Imamović Kurtović Alagić Smajić Džafić Jusufović
Pašalić Halilović Omerbegović Ćatić Mahmutović Spahić Demir Kaya Şahin Çelik Öztürk Arslan Aydın Doğan
Rahman Haddad Mešić Selimović Zukić Avdić Ibrić Tahirović Muratović Kovačević Salihović Bajrić""".split()
FACULTIES = {
    "FENS": ["Computer Sciences and Engineering", "Software Engineering", "Electrical and Electronics Engineering",
             "Mechanical Engineering", "Artificial Intelligence and Data Engineering", "Genetics and Bioengineering",
             "Architecture"],
    "FBA": ["Economics", "International Business and Finance", "Management",
            "Political Science and International Relations"],
    "FASS": ["Psychology", "English Language and Literature", "Media and Communication",
             "Visual Arts and Visual Communications Design"],
    "FMS": ["Medicine", "Dental Medicine"],
    "FLW": ["Bachelor in Law"],
    "FEDU": ["English Language and Literature Teaching", "Computer Education and Instructional Technology"],
}


def ascii_fold(s: str) -> str:
    s = s.replace("ı", "i").replace("đ", "dj").replace("Đ", "Dj")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


# ── what students talk about ──────────────────────────────────────────────────
# kind: "complaint" or "topic". Templates may use {day} / {time}.

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
TIMES = ["8:00", "9:15", "10:30", "12:00", "14:00"]

CATALOG = {
    "registration": ("complaint", [
        "Course registration crashed AGAIN right when it opened. I refreshed for 40 minutes and lost my spot in the elective.",
        "Is the registration system down for everyone or just me? Spinning wheel since 9am",
        "Registration portal kicked me out three times while I was adding courses, now the section is full",
        "Why does course registration always collapse on the first morning? Every single semester",
        "Sistem za registraciju opet ne radi, ne mogu dodati nijedan predmet",
        "Tried registering at midnight to avoid the rush, still got a server error. Who do we even contact?",
        "Lost my place in the morning section because the registration page froze. Great start to the semester",
        "The registration website can't handle everyone logging in at once, it's the same problem every year",
        "Anyone managed to register for electives today? The page just times out",
        "Registracija je haos, pola godine ne može da se upiše na predmete",
        "My advisor approved my courses but the system crashed before I could confirm them",
        "Registration servers down again, they really need to fix this before next semester",
    ]),
    "dorm_assignment": ("complaint", [
        "Still haven't got my dorm room assignment and classes start in a week. Anyone else?",
        "Dorm office says room assignments are 'being processed' — I arrive Friday, where do I sleep?",
        "Waiting for my dorm confirmation for two weeks now, no reply to emails",
        "Još nisam dobila sobu u domu, a stižem u nedjelju",
        "Does anyone know when the dorm room list will be published? My parents need to book travel",
        "Dorm assignments are so late this year, international students are stressing",
        "Got an email that my dorm room 'might change'. Can we please get a final answer",
        "No dorm assignment yet and the office phone never picks up",
    ]),
    "orientation": ("topic", [
        "Orientation day was actually fun, the campus tour guides were amazing",
        "Met so many people at orientation today, IUS feels like home already",
        "The welcome event for first years was really well organized, thanks to everyone involved",
        "Orientation week trivia night was the best, our team came second!",
        "Loved the orientation, especially the talk about student clubs",
        "Orijentacija je bila super, upoznala sam pola svoje generacije",
        "Freshmen orientation was great, the senior students were super helpful",
        "Best part of orientation: free coffee and the campus scavenger hunt",
    ]),
    "clubs_fair": ("topic", [
        "Signed up for four clubs at the clubs fair, no regrets",
        "The clubs fair was packed! So many options this year",
        "Joined the photography and debate clubs today at the fair, can't wait",
        "Clubs fair was awesome, the robotics club demo was so cool",
        "If you missed the clubs fair, most clubs are still accepting members this week",
        "Učlanila sam se u tri kluba na sajmu, jedva čekam prve sastanke",
        "The clubs fair had such a good atmosphere, loved the music",
        "Great energy at the clubs fair, finally something to do after classes",
    ]),
    "shuttle": ("complaint", [
        "The {time} shuttle from Ilidža was so full I couldn't get on. Missed my first class.",
        "Shuttle bus this morning was packed, people standing all the way to campus",
        "Can IUS add more shuttle buses in the morning? The {time} one is impossible",
        "Bus jutros opet pun, ostali smo na stanici",
        "Third time this week the shuttle didn't stop because it was full",
        "The shuttle schedule doesn't match our class times at all, either 40 minutes early or late",
        "Waited 25 minutes for the shuttle on {day}, it never came",
        "Shuttle overcrowding is getting dangerous, people pressed against the doors",
        "Missed a quiz because the {time} bus was full. Need more buses at peak hours",
        "Please more shuttles between 8 and 10, it's unbearable",
        "Šatl je kasnio 20 minuta i opet pun, ne znam kako da stignem na vrijeme",
        "The shuttle driver said they only have two buses for the morning rush",
    ]),
    "student_id": ("complaint", [
        "Still no student ID card, can't enter the library or the dorm without it",
        "Student ID cards were supposed to be ready this week, office says next week again",
        "Without my student card I can't get the transport discount, when are they coming?",
        "Studentska kartica još nije gotova, a već dvije sedmice čekam",
        "Anyone got their student ID yet? Mine is 'in printing' since forever",
        "The student ID delay means I can't use the gym or borrow books",
        "Paying full price for transport because my student ID still isn't ready",
    ]),
    "timetable": ("topic", [
        "Does anyone have the updated timetable for second-year FENS?",
        "Is the {day} {time} lab still on or was it moved?",
        "Timetable changed again, do we have class on {day} afternoon now?",
        "Which room is the {day} lecture in? The schedule says A-210 but it's locked",
        "Raspored za drugu godinu, zna li neko gdje je postavljen?",
        "Anyone else have three classes back to back on {day}? Brutal",
        "Is attendance taken in the first week of classes?",
        "Where can I find the official timetable, the portal shows an old version",
    ]),
    "library_wifi": ("complaint", [
        "Library wifi disconnected me five times in an hour, impossible to work",
        "The wifi in the library is basically unusable after 6pm",
        "Wifi u biblioteci opet ne radi, ne mogu ni mail otvoriti",
        "Can IT please fix the library wifi? I had to use mobile data to submit my assignment",
        "Library 3rd floor wifi keeps dropping, anyone else?",
        "The wifi in the library is slower than my phone hotspot",
        "Lost my online quiz because the library wifi cut out mid-submission",
        "Is the library wifi broken or just overloaded? Can't load anything",
        "Wifi on campus is fine but the library connection drops constantly",
        "Reported the library wifi to IT twice, nothing changed",
        "Ne mogu raditi u biblioteci jer internet stalno pada",
        "Library wifi is the reason I study at home now",
    ]),
    "cafeteria_prices": ("complaint", [
        "Cafeteria prices went up again? Lunch is now 7 KM, that's too much for students",
        "Coffee in the cafeteria costs more than in town now, why?",
        "Hrana u menzi je poskupjela, a porcije su manje",
        "Can we get a cheaper student menu in the cafeteria? Prices are getting crazy",
        "Cafeteria raised prices but the food quality is the same",
        "I can't afford to eat at the cafeteria every day anymore",
        "Why is a sandwich at the cafeteria suddenly 5 KM?",
        "The cafeteria price increase hits international students the hardest",
        "Bring back the old cafeteria prices please",
    ]),
    "erasmus": ("topic", [
        "Anyone applying for Erasmus next semester? Which universities are you choosing?",
        "Erasmus info session was really useful, deadline is in November",
        "Did anyone do Erasmus in Germany? How hard was the visa process?",
        "Erasmus application requires a B2 certificate, where can I get one quickly?",
        "Prijave za Erasmus su otvorene, ko ide?",
        "Erasmus students from Spain just arrived, say hi if you see them",
        "Thinking about Erasmus in Poland, any experiences?",
    ]),
    "grading": ("complaint", [
        "Prof. Begović still hasn't explained how the midterm is graded, we have no idea what counts",
        "Nobody understands the grading in Begović hoca's course, the syllabus says one thing and the quizzes another",
        "Got my quiz back from Prof. Begović with no comments, just a number. How do we improve?",
        "Profesor Begović nije objasnio kako se boduju zadaće",
        "The grading criteria in Prof. Begović's class change every week",
        "Asked Prof. Begović about the grading scheme, still no clear answer",
        "Can someone explain how Prof. Begović calculates participation points?",
        "Quiz grades from Begović hoca came back with no rubric at all",
        "Grading in Prof. Begović's course feels random, half the class is confused",
    ]),
    "career_fair": ("topic", [
        "Career fair was amazing, got two interview invitations!",
        "So many companies at the career fair this year, IT and banking especially",
        "Bring printed CVs to the career fair, the wifi in the main hall is bad",
        "Sajam karijera je bio odličan, konačno prilike za praksu",
        "Talked to three companies at the career fair about summer internships",
        "The career fair workshop on CV writing was really helpful",
        "Career fair tomorrow, any tips for first-timers?",
        "Got an internship offer from the career fair, can't believe it",
        "Career fair was well organized, thanks to the career center",
        "Who else is going to the career fair on Thursday?",
    ]),
    "sports": ("topic", [
        "Futsal tournament registrations are open, who's in?",
        "The sports hall gym is free for students until the end of the semester",
        "Our faculty team won the basketball match yesterday!",
        "Anyone want to play football on {day} after classes?",
        "Teretana u sportskoj dvorani je super, preporuka",
        "Volleyball training is on {day} evenings, beginners welcome",
        "The futsal final was so intense, great game",
    ]),
    "startup_weekend": ("topic", [
        "Startup Weekend registrations are open, looking for a designer for my team",
        "Startup Weekend was incredible, our team pitched a campus delivery app",
        "Who's going to Startup Weekend? Need one more developer",
        "Mentors at Startup Weekend were so helpful, learned a lot in 48 hours",
        "Startup Weekend vikend je bio super iskustvo",
        "Can first years join Startup Weekend? Asking for a friend (me)",
        "Startup Weekend final pitches were impressive this year",
    ]),
    "dorm_heating": ("complaint", [
        "It's freezing in the dorm, when is the heating turned on?",
        "Dorm heating still off and it was 5 degrees last night",
        "Grijanje u domu još ne radi, smrzavamo se",
        "Sleeping in a jacket because the dorm heating isn't on yet",
        "The dorm radiators are cold, the office says 'next week' every week",
        "Can the dorm heating please be turned on? Several people are sick already",
        "It's colder inside the dorm than outside, seriously",
        "Who decides when dorm heating starts? We're freezing",
        "Kad će grijanje u domu, ne može se učiti od hladnoće",
    ]),
    "midterm_clash": ("complaint", [
        "Midterm schedule is out and I have two exams at the same time on {day}",
        "Two of my midterms clash on the same day, who do I contact?",
        "The midterm schedule was published so late and it has clashes",
        "Imam dva ispita u isto vrijeme, raspored je katastrofa",
        "Midterm exam clashes again, the schedule should be checked before publishing",
        "Three midterms in one day, the schedule makes no sense",
        "Anyone else with overlapping midterms? We should email student services together",
    ]),
    "library_hours": ("topic", [
        "Library open until 23:00 during midterms, thank you!",
        "Extended library hours are a lifesaver this week",
        "Biblioteka radi do 23h, odlično",
        "So glad the library stays open late now, 3rd floor is perfect for studying",
        "The new library hours are great, please keep them after midterms",
    ]),
    "printer": ("complaint", [
        "The printer in FENS lab 2 is broken again",
        "FENS lab printer has been jammed since Monday",
        "Can someone fix the printer in the FENS lab, can't print my report",
    ]),
    "parking_public": ("complaint", [
        "Is there any free parking near the main building?",
        "Parking near campus is a nightmare in the morning",
    ]),
    "chatter": ("topic", [
        "Best coffee spot near campus? The cafeteria line is too long",
        "Who's watching the derby on Saturday?",
        "Found a black umbrella in A-building, message me if it's yours",
        "Anyone going to Sarajevo city center on Friday? Looking for a ride",
        "Weekend plans: sleep, sleep and more sleep",
        "Ko ide na kafu poslije predavanja?",
        "Is it just me or is the campus really beautiful in autumn",
        "Lost my headphones in the library, grey case",
        "Recommend a good series to watch this weekend?",
        "Who else is surviving on energy drinks this week",
        "Rain again, of course on the day I forgot my umbrella",
        "Ima li neko punjač za laptop da mi posudi?",
        "Happy birthday to my roommate, she doesn't use this app but still",
        "What's the best place for ćevapi near Ilidža?",
        "Anyone else's alarm not go off this morning? Missed the first class",
    ]),
}

# How many different students raise each subject, per simulated week (oldest first).
SCHEDULE = [
    {"registration": 26, "dorm_assignment": 13, "timetable": 11, "erasmus": 6, "printer": 3, "parking_public": 2, "chatter": 25},
    {"orientation": 21, "clubs_fair": 17, "shuttle": 14, "student_id": 12, "registration": 11, "dorm_assignment": 8,
     "timetable": 12, "printer": 2, "chatter": 30},
    {"timetable": 15, "shuttle": 20, "library_wifi": 10, "cafeteria_prices": 11, "clubs_fair": 9, "erasmus": 12,
     "sports": 10, "parking_public": 3, "printer": 4, "chatter": 30},
    {"library_wifi": 18, "shuttle": 19, "cafeteria_prices": 15, "grading": 12, "career_fair": 11, "sports": 13,
     "erasmus": 8, "printer": 3, "chatter": 30},
    {"career_fair": 30, "library_wifi": 26, "cafeteria_prices": 16, "shuttle": 17, "startup_weekend": 12, "grading": 7,
     "sports": 11, "parking_public": 3, "chatter": 30},
    {"dorm_heating": 22, "startup_weekend": 18, "midterm_clash": 13, "library_wifi": 14, "library_hours": 12,
     "shuttle": 16, "cafeteria_prices": 13, "printer": 4, "chatter": 30},
]

CLUB_FOR = {"sports": "sports", "career_fair": "careers", "startup_weekend": "careers",
            "erasmus": "international", "clubs_fair": "international"}

# Excluded sources — loaded with parking complaints so a leak would be obvious.
PRIVATE_PARKING = [
    "Parking situation at the dorm is getting ridiculous, someone blocked my car again",
    "We should petition for more parking spots behind Block C",
    "Parking je katastrofa, svako jutro 20 minuta tražim mjesto",
    "Got a parking ticket right in front of the dorm, unbelievable",
    "Parking near the dorm should be residents only",
]


def fill(template: str) -> str:
    return template.format(day=rng.choice(DAYS), time=rng.choice(TIMES))


async def seed(force: bool) -> None:
    assert_local()
    weeks = [last_completed_week() - timedelta(weeks=WEEKS - 1 - i) for i in range(WEEKS)]

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User.id).where(User.email.like(f"%@{DOMAIN}")))).scalars().all()
        if existing and not force:
            sys.exit("Pulse data already exists. Re-run with --force to replace it.")
        if existing:
            anon = select(AnonymousPostAuthor.post_id).where(AnonymousPostAuthor.user_id.in_(existing))
            # Replies go with their parents (parent_post_id is ON DELETE CASCADE).
            await db.execute(delete(Post).where(or_(Post.author_id.in_(existing), Post.id.in_(anon))))
            await db.execute(delete(Club).where(Club.created_by.in_(existing)))
            await db.execute(delete(User).where(User.id.in_(existing)))
        await db.execute(delete(PulseReport))
        await db.commit()

        # ── students ──
        pw = hash_password(secrets.token_urlsafe(24))  # nobody knows it: these accounts can't log in
        students, used = [], set()
        for i in range(90):
            first, last = rng.choice(FIRST), rng.choice(LAST)
            while (first, last) in used:
                first, last = rng.choice(FIRST), rng.choice(LAST)
            used.add((first, last))
            faculty = rng.choice(list(FACULTIES))
            username = f"{ascii_fold(first)}.{ascii_fold(last)[:4]}{i}"
            u = User(
                id=uuid.uuid4(), email=f"{username}@{DOMAIN}", username=username,
                display_name=f"{first} {last}", password_hash=pw, faculty=faculty,
                program=rng.choice(FACULTIES[faculty]), is_email_verified=True, is_active=True,
                created_at=datetime.combine(weeks[0], datetime.min.time(), tzinfo=timezone.utc) - timedelta(days=rng.randint(30, 400)),
            )
            db.add(u)
            students.append(u)
        await db.flush()

        # ── clubs: three public, one private (excluded) ──
        def club(key, name, private=False):
            c = Club(id=uuid.uuid4(), name=name, slug=f"pulse-{key}", description=f"{name} at IUS.",
                     created_by=rng.choice(students).id, is_private=private,
                     created_at=datetime.combine(weeks[0], datetime.min.time(), tzinfo=timezone.utc) - timedelta(days=120))
            db.add(c)
            return c
        clubs = {
            "sports": club("sports", "IUS Sports Society"),
            "careers": club("careers", "Careers & Internships Network"),
            "international": club("international", "International Students Circle"),
        }
        dorm_club = club("dorm", "Dorm Block C Residents", private=True)
        await db.flush()
        for c in [*clubs.values(), dorm_club]:
            for s in rng.sample(students, 25):
                db.add(ClubMember(club_id=c.id, user_id=s.id, role="member"))
        await db.flush()

        # ── posts, week by week ──
        top_level: list[Post] = []
        replies: list[Post] = []
        anon_links: list[AnonymousPostAuthor] = []
        for week, plan in zip(weeks, SCHEDULE):
            def when():
                return datetime.combine(week, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
                    days=rng.randint(0, 6), hours=rng.randint(7, 22), minutes=rng.randint(0, 59))

            for key, n in plan.items():
                kind, templates = CATALOG[key]
                earlier: list[Post] = []
                for s in rng.sample(students, n):
                    for _ in range(2 if rng.random() < 0.25 else 1):
                        roll = rng.random()
                        if kind == "complaint" and roll < 0.4 or kind == "topic" and roll < 0.1:
                            post_type, club_obj = "anonymous_qa", None
                        elif key in CLUB_FOR and roll < 0.55:
                            post_type, club_obj = "club", clubs[CLUB_FOR[key]]
                        else:
                            post_type, club_obj = "feed", None
                        anon = post_type == "anonymous_qa"
                        parent = None
                        candidates = [p for p in earlier if p.post_type == post_type and p.club_id == (club_obj.id if club_obj else None)]
                        if candidates and rng.random() < 0.35:
                            parent = rng.choice(candidates)
                        p = Post(
                            id=uuid.uuid4(), author_id=None if anon else s.id, content=fill(rng.choice(templates)),
                            post_type=post_type, club_id=club_obj.id if club_obj else None,
                            parent_post_id=parent.id if parent else None, is_anonymous=anon,
                            faculty_tag=s.faculty if rng.random() < 0.4 else None,
                            created_at=max(when(), parent.created_at + timedelta(minutes=rng.randint(5, 600))) if parent else when(),
                        )
                        (replies if parent else top_level).append(p)
                        if not parent:
                            earlier.append(p)
                        if anon:
                            anon_links.append(AnonymousPostAuthor(post_id=p.id, user_id=s.id, created_at=p.created_at))

            # Excluded sources: private club posts, club chat, DMs — all about parking.
            dorm_members = rng.sample(students, 15)
            for s in dorm_members:
                top_level.append(Post(id=uuid.uuid4(), author_id=s.id, content=rng.choice(PRIVATE_PARKING),
                                      post_type="club", club_id=dorm_club.id, created_at=when()))
                db.add(ChatMessage(club_id=clubs["sports"].id, author_id=s.id,
                                   content=rng.choice(PRIVATE_PARKING), created_at=when()))
            for _ in range(10):
                a, b = rng.sample(students, 2)
                u1, u2 = (a, b) if str(a.id) < str(b.id) else (b, a)
                conv = (await db.execute(select(Conversation).where(
                    Conversation.user1_id == u1.id, Conversation.user2_id == u2.id))).scalar_one_or_none()
                if conv is None:
                    conv = Conversation(id=uuid.uuid4(), user1_id=u1.id, user2_id=u2.id, created_at=when())
                    db.add(conv)
                    await db.flush()
                db.add(DirectMessage(conversation_id=conv.id, sender_id=a.id,
                                     content=rng.choice(PRIVATE_PARKING), created_at=when()))

        db.add_all(top_level)
        await db.flush()
        db.add_all(replies)
        await db.flush()
        db.add_all(anon_links)
        await db.commit()

    print(f"Campus Pulse data seeded: {len(students)} students, {len(top_level) + len(replies)} posts "
          f"across {WEEKS} weeks ({weeks[0]} … {weeks[-1] + timedelta(days=6)}).")
    print("Generate reports oldest-first so trends work:")
    print("    docker compose exec backend python scripts/pulse_backfill.py")


if __name__ == "__main__":
    asyncio.run(seed(force="--force" in sys.argv))

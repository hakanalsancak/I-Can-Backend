--
-- PostgreSQL database dump
--

\restrict YXEeHSzhccNmWLLTPXKNwsOoHXqGoEIfU149zsHBTc6TeuUkwpbdfVtmTl18ajA

-- Dumped from database version 17.8 (a284a84)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    report_type character varying(10) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    report_content jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    entry_count integer,
    CONSTRAINT ai_reports_report_type_check CHECK (((report_type)::text = ANY ((ARRAY['weekly'::character varying, 'monthly'::character varying, 'yearly'::character varying])::text[])))
);


--
-- Name: chat_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    usage_date date DEFAULT CURRENT_DATE NOT NULL,
    message_count integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: daily_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date NOT NULL,
    activity_type character varying(20) NOT NULL,
    focus_rating smallint,
    effort_rating smallint,
    confidence_rating smallint,
    performance_score smallint,
    did_well text,
    improve_next text,
    rotating_question_id smallint,
    rotating_answer text,
    created_at timestamp with time zone DEFAULT now(),
    responses jsonb,
    CONSTRAINT daily_entries_activity_type_check CHECK (((activity_type)::text = ANY ((ARRAY['training'::character varying, 'game'::character varying, 'rest_day'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT daily_entries_confidence_rating_check CHECK (((confidence_rating >= 1) AND (confidence_rating <= 10))),
    CONSTRAINT daily_entries_effort_rating_check CHECK (((effort_rating >= 1) AND (effort_rating <= 10))),
    CONSTRAINT daily_entries_focus_rating_check CHECK (((focus_rating >= 1) AND (focus_rating <= 10)))
);


--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    platform character varying(10) DEFAULT 'ios'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    email character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    type character varying(20) DEFAULT 'feedback'::character varying
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    status character varying(10) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT friend_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'declined'::character varying])::text[])))
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    friend_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    goal_type character varying(10) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    target_value integer,
    current_value integer DEFAULT 0,
    is_completed boolean DEFAULT false,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT goals_goal_type_check CHECK (((goal_type)::text = ANY ((ARRAY['weekly'::character varying, 'monthly'::character varying, 'yearly'::character varying])::text[])))
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    notification_type character varying(30) NOT NULL,
    content text,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rotating_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rotating_questions (
    id smallint NOT NULL,
    question_text text NOT NULL,
    answer_type character varying(20) DEFAULT 'slider'::character varying
);


--
-- Name: streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streaks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_entry_date date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    apple_transaction_id character varying(255),
    product_id character varying(100),
    status character varying(20) DEFAULT 'trial'::character varying,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255),
    password_hash character varying(255),
    full_name character varying(100),
    apple_id character varying(255),
    google_id character varying(255),
    sport character varying(50) DEFAULT 'soccer'::character varying NOT NULL,
    mantra text,
    notification_frequency integer DEFAULT 1,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    age integer,
    country character varying(10),
    gender character varying(20),
    team character varying(100),
    competition_level character varying(30),
    "position" character varying(50),
    primary_goal text,
    username character varying(30),
    profile_photo_url character varying(500)
);


--
-- Data for Name: ai_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_reports (id, user_id, report_type, period_start, period_end, report_content, created_at, entry_count) FROM stdin;
6d5aa3fe-35e6-4376-b091-8e0f4c5b42f5	e912748b-11eb-4c09-a972-83a716a041ce	weekly	2026-03-16	2026-03-22	{"summary": "This week has been a mix of hard work and valuable lessons for you. Your training on footwork paid off in the game on Saturday, where you landed 12 clean punches and executed a beautiful combination. However, there were moments of struggle, particularly with your step back and keeping your hands up, which you identified as areas to improve. Overall, you're making progress, but there are specific adjustments needed to continue elevating your performance.", "strengths": ["Your footwork skills have shown significant improvement this week, especially noted in your training on March 17 where you stated, 'My footwork skills improved a lot today.' This is crucial, as it directly contributed to your success in the game on March 21 where you effectively dodged and countered.", "Your jab has become more precise, as you mentioned on March 18 that, 'My jab got really on point.' This improvement is vital for setting up your other punches and maintaining control in the ring.", "In the game on March 21, you executed an impressive combination with your left hook and cross, showcasing your ability to apply training in real scenarios. This is a testament to your dedication and skill development.", "Your commitment to recovery and study on your rest days, such as watching match film and studying tactics, demonstrates a well-rounded approach to your training. This mindfulness is essential for your growth as an athlete."], "growthAreas": [{"area": "Footwork and Defense", "analysis": "You've made clear strides in footwork, yet it remains a common mistake in both training and games. A focused approach on defensive movement could enhance your overall game strategy.", "recommendation": "Incorporate shadowboxing with a focus on defensive footwork drills and partner sparring that emphasizes movement and evasion."}, {"area": "Mental Resilience", "analysis": "Your self-awareness is increasing, but enhancing your ability to bounce back from mistakes will strengthen your mental game. Recognizing setbacks as learning opportunities will align with your mantra, 'I’m here.'", "recommendation": "Practice visualization techniques after training sessions, mentally rehearsing positive outcomes from your mistakes to build confidence."}], "actionableTips": ["During your next training session, focus specifically on drills that emphasize step back movements to improve your reflexes, especially under pressure.", "Set aside 10-15 minutes after each sparring session to reflect on both your strengths and areas of improvement, enhancing your ability to learn from each experience.", "When working on keeping your hands up, utilize a partner to simulate punches during drills, allowing you to practice maintaining guard under pressure.", "Incorporate more mobility exercises on your rest days to improve overall agility, which will benefit your footwork and defensive maneuvers in the ring.", "Continue to study game footage, but focus specifically on analyzing defensive strategies to understand how others maintain their guard, applying those insights to your training."], "mentalPatterns": "Throughout the week, your self-reflection has shown a growing awareness of your strengths and weaknesses. You effectively recognized areas for improvement, such as your step back and defensive positioning. After your games, you were able to articulate specific mistakes, which indicates a developing mindset towards growth. However, there's room for improvement in how you handle setbacks — maintaining a focus on your mantra, 'I’m here,' can help ground you during tough moments, reminding you to stay present and learn from each experience.", "physicalPatterns": "Physically, your training load appears balanced, with a focus on footwork and punching speed, as seen in your training entries from March 17 to March 19. However, the repeated mention of common mistakes suggests that while the quantity of training is there, the quality might need refining—especially in defensive techniques. Your rest days seem well-placed, allowing for recovery, but ensure that you're also maximizing these days with smart recovery tactics to avoid overtraining.", "areasForImprovement": ["Your step back reflexes were highlighted as a key area for improvement after your game on March 16. This is crucial for maintaining distance and avoiding incoming punches, so prioritize drills that focus on movement efficiency and reaction time in your next training sessions.", "You repeatedly noted issues with 'getting punched' and 'keeping hands up' during both training and games. This indicates a pattern that requires targeted attention. Incorporate drills focused on defensive maneuvers and maintaining guard under pressure to strengthen your defensive skills.", "Your most common mistake this week was related to footwork, which you identified multiple times. While there has been progress, refining your foot positioning and movement in conjunction with your punches will be critical for your overall performance."], "consistencyAnalysis": "You logged a solid 7 entries this week, demonstrating a commitment to tracking your progress. Your activities are varied, with a healthy mix of training, game play, and rest. However, be mindful of the specific details you track; consistency in logging each aspect will give you better insights into your training patterns and effectiveness.", "motivationalMessage": "This week has shown just how much potential you have when you lean into your strengths while addressing your weaknesses. Your best moment — that stunning left hook followed by a cross — is a reflection of your hard work and dedication. Keep pushing forward with the mindset that 'I’m here,' and remember that every setback is simply a stepping stone on your journey to becoming the boxer you aspire to be."}	2026-03-23 00:00:26.229696+00	7
\.


--
-- Data for Name: chat_usage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_usage (id, user_id, usage_date, message_count, updated_at) FROM stdin;
2ed372d8-55ba-4ed0-9763-2a75cf20ad1e	f304b21d-2197-48da-b2f6-48509abe5d91	2026-03-22	7	2026-03-22 17:46:58.16644+00
5635a619-9529-4b24-ae0f-c182daf9c7aa	fe976dd2-7421-444c-8d23-8e95045dde5f	2026-03-22	7	2026-03-22 18:10:17.805881+00
34080343-b7c9-40c5-a8b7-70b643546c05	01b2725e-7290-44c0-b6e3-e48d80ffbe25	2026-03-22	7	2026-03-22 18:26:35.733893+00
443fbe99-43f6-4108-81b5-f2cd66148476	f304b21d-2197-48da-b2f6-48509abe5d91	2026-03-23	7	2026-03-23 00:07:52.551278+00
\.


--
-- Data for Name: daily_entries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.daily_entries (id, user_id, entry_date, activity_type, focus_rating, effort_rating, confidence_rating, performance_score, did_well, improve_next, rotating_question_id, rotating_answer, created_at, responses) FROM stdin;
20baf1d8-37a7-453f-991b-efc36aef752a	f49c8ca6-77a8-4203-b328-2cdb78e0bb9d	2026-03-06	training	5	5	5	5	Ben	Sandbox	5	8	2026-03-06 23:49:01.960315+00	\N
402a59dc-e628-493c-a56f-fc2b889bc9be	82f59a8c-44b5-4de8-8684-e18fe290b952	2026-03-07	game	10	9	8	9	Sets	Gaffs	6	3	2026-03-07 00:40:05.096364+00	\N
456bb8db-236b-40cd-bb08-c1d4a8607fdc	b38f9511-2aac-4b68-ba56-12f8ad9b7313	2026-03-16	training	7	8	8	77	\N	\N	\N	\N	2026-03-16 23:55:14.401932+00	{"workedOn": ["Return"], "hardestDrill": "tamam ", "commonMistake": "y", "skillImproved": "tamam ", "tomorrowFocus": "y"}
8971dd1d-7842-4f77-8968-675f3716505f	ec11cae0-725b-444c-bfe2-b753d5c642e7	2026-03-07	training	9	2	7	6	Dfdffgh	Ggcfgh	6	3	2026-03-07 12:45:34.313671+00	\N
f898a2fb-a0da-453d-8361-eed23c73cc4e	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-17	training	9	9	8	87	\N	\N	\N	\N	2026-03-17 00:30:42.182638+00	{"workedOn": ["Body work", "Footwork", "Bag / pad work"], "hardestDrill": "Pad work was really tricky", "commonMistake": "I got punched by the punchbag😅", "skillImproved": "My footwork skills improved a lot today", "tomorrowFocus": "My footwork again"}
07ed6179-48e4-449a-aaf9-9a8af0491de9	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-25	rest_day	5	6	6	57	\N	\N	\N	\N	2026-03-25 14:40:08.331038+00	{"sportStudy": "No", "restTomorrowFocus": "idk", "recoveryActivities": ["Rest"]}
f83a650e-a39f-462e-85cc-e93457db234f	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-18	training	9	9	8	87	\N	\N	\N	\N	2026-03-18 00:00:58.936459+00	{"workedOn": ["Footwork", "Sparring", "Combinations"], "hardestDrill": "Throwing jab 200 times non-stop", "commonMistake": "Footwork", "skillImproved": "My jab got really on point", "tomorrowFocus": "Footwork skills"}
2ef13b18-8bc5-4881-9cf4-cbb2d4cd1db0	95a33868-c8a6-494b-b0fb-47faa7a38cf9	2026-03-08	rest_day	7	6	7	7	Stayed focus on points	Leadership	\N	\N	2026-03-08 14:05:19.735431+00	{"discipline": "Mostly", "restActivities": ["Full rest", "Mental training"], "recoveryQuality": "Good", "recoveryReflection": "Good sleep"}
1d841098-ba5e-4f8e-949c-bbcd8b2a2e2f	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-19	training	7	8	8	77	\N	\N	\N	\N	2026-03-19 01:23:18.297894+00	{"workedOn": ["Sparring"], "hardestDrill": "punching", "commonMistake": "getting punched", "skillImproved": "my punches got faster", "tomorrowFocus": "punching"}
da86674f-442d-43b2-b5b6-78c91a957e84	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-20	rest_day	6	6	7	63	\N	\N	\N	\N	2026-03-20 00:56:41.528807+00	{"sportStudy": "Studied tactics", "restTomorrowFocus": "Tomorrow I will wake up at 4:30 am and run out in the street.", "recoveryActivities": ["Rest"]}
82a20c02-6981-4538-9b02-81984bd91ab2	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-14	training	8	9	5	73	\N	\N	\N	\N	2026-03-14 03:30:21.503008+00	{"workedOn": ["Sparring", "Combinations", "Defense / head movement"], "hardestDrill": "Sparring with a better boxer than me", "commonMistake": "not crouching enough to dodge the hooks of the opponent.", "skillImproved": "My head movement"}
23cc2403-9a00-414c-adf3-db0c34106f82	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-15	rest_day	7	7	8	73	\N	\N	\N	\N	2026-03-15 02:29:20.220445+00	{"sportStudy": "Watched match film", "restTomorrowFocus": "I have a boxing match tomorrow in the Kent Championship.", "recoveryActivities": ["Ice bath", "Rest"]}
26bde36f-3394-4ccb-a056-2482f6c64481	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-16	game	4	5	5	47	\N	\N	\N	\N	2026-03-16 03:48:37.126102+00	{"gameStats": {"warnings": 1, "knockdowns": 2, "cleanPunches": 1, "roundsFought": 1}, "bestMoment": "1-2-1", "biggestMistake": "Step back was not far enough", "improveNextGame": "Step back reflexes"}
d634b24c-65ac-40e4-9748-d29cd1fc8a72	fe976dd2-7421-444c-8d23-8e95045dde5f	2026-03-21	training	8	9	8	83	\N	\N	\N	\N	2026-03-21 00:19:26.235209+00	{"workedOn": ["Sparring", "Defense / head movement"], "hardestDrill": "100 push ups 3 sets", "commonMistake": "Not being able to complete the push ups", "skillImproved": "My punch strength", "tomorrowFocus": "Keep my chin down in sparring"}
5a1311f1-1a00-4675-9cf5-d11f4276c470	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-21	game	9	9	9	90	\N	\N	\N	\N	2026-03-21 00:21:26.481279+00	{"gameStats": {"warnings": 1, "knockdowns": 0, "cleanPunches": 12, "roundsFought": 3}, "bestMoment": "Left hook to the head, slip back to dodge the jab and come back with a cross", "biggestMistake": "When I went to the corner I couldn’t keep my hands up properly ", "improveNextGame": "Keeping hands up"}
762b9f2c-cc82-493e-9a24-b04dc2a63a58	fe976dd2-7421-444c-8d23-8e95045dde5f	2026-03-22	rest_day	7	7	8	73	\N	\N	\N	\N	2026-03-22 19:55:23.307942+00	{"sportStudy": "Studied tactics", "restTomorrowFocus": "training", "recoveryActivities": ["Ice bath", "Mobility"]}
9d1ad9a3-91cb-4179-a957-3ef15e7e6bdd	01b2725e-7290-44c0-b6e3-e48d80ffbe25	2026-03-22	rest_day	7	7	8	73	\N	\N	\N	\N	2026-03-22 19:56:08.662924+00	{"sportStudy": "Studied tactics", "restTomorrowFocus": "match", "recoveryActivities": ["Rest", "Mobility"]}
85c63da6-74b9-447e-b5b2-25a07d33bcf5	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-22	rest_day	7	7	8	73	\N	\N	\N	\N	2026-03-22 20:14:04.145565+00	{"sportStudy": "Watched match film", "restTomorrowFocus": "Sparring mostly", "recoveryActivities": ["Mobility", "Rest"]}
96d208aa-c217-48d4-bf99-d5cfe621f85b	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-23	training	7	8	8	77	\N	\N	\N	\N	2026-03-23 19:06:30.383671+00	{"workedOn": ["Conditioning / cardio"], "hardestDrill": "Sprinting the last mile", "commonMistake": "Nothing thankfully it was just running", "skillImproved": "I ran 5 miles so I can say my cardio improved a lot", "tomorrowFocus": "I will do some sparring tomorrow "}
5bfbb0c9-5d49-4fb6-84a8-e095dfc698dd	e5ead113-0238-480c-8938-2b7dbfa7d5cb	2026-03-24	rest_day	6	6	7	63	\N	\N	\N	\N	2026-03-24 21:17:11.244968+00	{"sportStudy": "Watched match film", "restTomorrowFocus": "djdj", "recoveryActivities": ["Mobility"]}
64a76c5d-b44a-43ee-9295-158ed23e1b5f	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-24	rest_day	6	6	7	63	\N	\N	\N	\N	2026-03-24 21:41:09.307473+00	{"sportStudy": "Watched match film", "restTomorrowFocus": "Running", "recoveryActivities": ["Stretching"]}
\.


--
-- Data for Name: device_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.device_tokens (id, user_id, token, platform, created_at) FROM stdin;
\.


--
-- Data for Name: feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.feedback (id, user_id, message, email, created_at, type) FROM stdin;
6278f5b6-42f0-445d-a061-d06a3e18d6a0	95a33868-c8a6-494b-b0fb-47faa7a38cf9	You can add daily reports	\N	2026-03-13 02:50:19.743504+00	feedback
f6d85019-f8e4-4baf-9221-efcf732b7e3c	e912748b-11eb-4c09-a972-83a716a041ce	Hi	\N	2026-03-15 02:43:31.894796+00	feedback
52eda288-5342-4ae8-9ef1-79c40eba9ffe	e912748b-11eb-4c09-a972-83a716a041ce	Hey	\N	2026-03-15 02:43:37.511345+00	bug_report
26df5e99-84e0-4e0b-b9d5-21781c5dc227	e912748b-11eb-4c09-a972-83a716a041ce	Dad	\N	2026-03-18 00:52:24.066293+00	feedback
6233c9c8-5905-408f-9983-9f6ef23940e3	e912748b-11eb-4c09-a972-83a716a041ce	hi	\N	2026-03-18 17:47:19.594136+00	feedback
2bbddbea-3f0e-409c-a93c-93fe2606426d	e912748b-11eb-4c09-a972-83a716a041ce	hi	\N	2026-03-18 17:47:26.124909+00	bug_report
3e768ef5-5ec3-403f-9b97-3d6112dc2b9e	e912748b-11eb-4c09-a972-83a716a041ce	ı saw a bug	\N	2026-03-20 18:15:13.761073+00	bug_report
2e90cad3-9cf9-45ea-8c69-1d58a2ddecc8	e912748b-11eb-4c09-a972-83a716a041ce	DBlablabla	\N	2026-03-23 00:04:19.578791+00	feedback
0448298c-e7b6-4d51-9383-c2bd80fba29e	e912748b-11eb-4c09-a972-83a716a041ce	dndnbd	\N	2026-03-23 00:04:24.394059+00	bug_report
f7b76aa8-17c3-4c02-ab19-b778e4a444a6	e912748b-11eb-4c09-a972-83a716a041ce	hey	\N	2026-03-25 10:00:32.207583+00	feedback
0d693e7b-f148-4eb7-a303-8975999f8d9a	e912748b-11eb-4c09-a972-83a716a041ce	hey	\N	2026-03-25 10:00:38.323868+00	bug_report
7abc5798-3774-4138-8f8d-d1dce2dcedff	e912748b-11eb-4c09-a972-83a716a041ce	this is terrible	\N	2026-03-25 16:38:52.199179+00	feedback
18d56ba7-2684-40b4-8653-210514d35bc3	e912748b-11eb-4c09-a972-83a716a041ce	İ found a bug , there is bug on my screen	\N	2026-03-25 16:39:22.676577+00	bug_report
\.


--
-- Data for Name: friend_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.friend_requests (id, sender_id, receiver_id, status, created_at, updated_at) FROM stdin;
31ff59cc-62a9-40a6-b46a-fb8a221386ce	e912748b-11eb-4c09-a972-83a716a041ce	77c20696-bf22-4b3e-b878-fcc5cc0417aa	pending	2026-03-14 03:11:24.551763+00	2026-03-14 03:11:24.551763+00
37f1bf32-3b45-4351-be2b-9ec4bbd70edd	e912748b-11eb-4c09-a972-83a716a041ce	017404f9-1b31-4004-86be-b42326c05d37	pending	2026-03-14 15:11:11.218819+00	2026-03-14 15:11:11.218819+00
099d17b3-61e9-462a-a1a3-d7d336a08e6b	e912748b-11eb-4c09-a972-83a716a041ce	eb6c4785-e090-4e81-b49e-29fdafc01529	pending	2026-03-14 15:11:13.059182+00	2026-03-14 15:11:13.059182+00
2b9285a0-2de3-48fa-862f-5ab55b911380	e912748b-11eb-4c09-a972-83a716a041ce	6d862470-eed7-4154-ad3d-e4778db98b80	pending	2026-03-14 15:15:42.499069+00	2026-03-14 15:15:42.499069+00
80377ccf-d8f8-4238-88c2-aceeab84e07e	e912748b-11eb-4c09-a972-83a716a041ce	fe976dd2-7421-444c-8d23-8e95045dde5f	accepted	2026-03-14 15:19:14.417504+00	2026-03-14 15:28:31.850519+00
a1f3ad7b-665d-486e-bb2b-708a1f7a2cb1	fe976dd2-7421-444c-8d23-8e95045dde5f	017404f9-1b31-4004-86be-b42326c05d37	pending	2026-03-14 15:28:44.732914+00	2026-03-14 15:28:44.732914+00
aad436ee-7125-4f78-8ad7-3114bd50d4c8	fe976dd2-7421-444c-8d23-8e95045dde5f	eb6c4785-e090-4e81-b49e-29fdafc01529	pending	2026-03-14 15:28:45.444393+00	2026-03-14 15:28:45.444393+00
50def5b3-7141-4285-b05b-d2a08cf2b6af	e912748b-11eb-4c09-a972-83a716a041ce	95a33868-c8a6-494b-b0fb-47faa7a38cf9	accepted	2026-03-14 03:10:57.501668+00	2026-03-18 00:52:55.316814+00
d42fb602-6a5f-416c-8268-5b9f3938c107	e912748b-11eb-4c09-a972-83a716a041ce	f304b21d-2197-48da-b2f6-48509abe5d91	accepted	2026-03-21 09:31:53.211835+00	2026-03-22 17:04:59.48896+00
97fefb09-b4f9-4c9f-9b24-1c9b2020b20b	f304b21d-2197-48da-b2f6-48509abe5d91	01b2725e-7290-44c0-b6e3-e48d80ffbe25	accepted	2026-03-22 19:49:28.670844+00	2026-03-22 19:54:09.322345+00
8fb5ca16-c317-4ef5-a740-30b49b2ab86a	f304b21d-2197-48da-b2f6-48509abe5d91	fe976dd2-7421-444c-8d23-8e95045dde5f	accepted	2026-03-22 19:50:01.547554+00	2026-03-22 19:54:49.717207+00
2687ebc7-969b-4559-b3d5-5665be8fad32	f304b21d-2197-48da-b2f6-48509abe5d91	e912748b-11eb-4c09-a972-83a716a041ce	accepted	2026-03-22 20:01:45.316163+00	2026-03-22 20:02:14.576441+00
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.friendships (id, user_id, friend_id, created_at) FROM stdin;
ba50bc04-c09d-4754-937b-5110eaf8ace3	e912748b-11eb-4c09-a972-83a716a041ce	fe976dd2-7421-444c-8d23-8e95045dde5f	2026-03-14 15:28:31.567264+00
ef18c34c-9acb-4dc2-a30b-56a1a32653ce	fe976dd2-7421-444c-8d23-8e95045dde5f	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-14 15:28:31.711434+00
da346a51-3d10-483d-b1f1-634a8454de17	f304b21d-2197-48da-b2f6-48509abe5d91	01b2725e-7290-44c0-b6e3-e48d80ffbe25	2026-03-22 19:54:09.322345+00
05b43608-b2d3-472f-8def-ad6c35d0cae0	01b2725e-7290-44c0-b6e3-e48d80ffbe25	f304b21d-2197-48da-b2f6-48509abe5d91	2026-03-22 19:54:09.322345+00
24d3892e-4a8d-4b0a-a22e-7766306caf0f	f304b21d-2197-48da-b2f6-48509abe5d91	fe976dd2-7421-444c-8d23-8e95045dde5f	2026-03-22 19:54:49.717207+00
35b542c6-b5d5-4574-b048-44f952b96e3a	fe976dd2-7421-444c-8d23-8e95045dde5f	f304b21d-2197-48da-b2f6-48509abe5d91	2026-03-22 19:54:49.717207+00
15b0ab92-65ed-4b0f-a741-ab8f6c918736	f304b21d-2197-48da-b2f6-48509abe5d91	e912748b-11eb-4c09-a972-83a716a041ce	2026-03-22 20:02:14.576441+00
c38c605a-d45e-48b1-aba5-30e586840432	e912748b-11eb-4c09-a972-83a716a041ce	f304b21d-2197-48da-b2f6-48509abe5d91	2026-03-22 20:02:14.576441+00
\.


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.goals (id, user_id, goal_type, title, description, target_value, current_value, is_completed, start_date, end_date, created_at, updated_at) FROM stdin;
0f5324b5-67cf-4b0a-b394-f5569a7da50d	82f59a8c-44b5-4de8-8684-e18fe290b952	weekly	Train 5 times	\N	\N	0	f	\N	\N	2026-03-07 00:53:01.933997+00	2026-03-07 00:53:04.535836+00
\.


--
-- Data for Name: notification_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification_log (id, user_id, notification_type, content, sent_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, created_at) FROM stdin;
214131d5-e109-49ae-89aa-8abb0ad30be9	e5ead113-0238-480c-8938-2b7dbfa7d5cb	e83f47a9a59ddc1d92749aa34bdff17af2f8a192082da1b411bd740dc7314017	2026-03-31 21:17:03.462+00	2026-03-24 21:17:03.525961+00
a12b7b68-9136-465e-8081-f85acb729191	e912748b-11eb-4c09-a972-83a716a041ce	6d143b94bbe21b21effe6f6a734d528d895faa15ae68897f0cecd395e8a59bfa	2026-04-01 17:52:46.947+00	2026-03-25 17:52:47.009725+00
3cb6537b-b3eb-4f29-87eb-a6a19d0b55c2	fe976dd2-7421-444c-8d23-8e95045dde5f	9d38b9a65e2dc6ec46d1e35131725cdcddb519024744efffd3992eecf82b23da	2026-03-29 18:09:20.48+00	2026-03-22 18:09:20.54238+00
92856a48-8bc2-42be-bb35-1b870b5c3589	b35d5a25-51d3-4ea5-9970-f81ce8b01202	56bdf86d58c07111d69cdf58704262674600c964ffd6c881e5bae26a45b3c3a9	2026-03-29 18:18:31.969+00	2026-03-22 18:18:32.030717+00
138b75c3-1ade-4168-91a8-9f60eef2f9d8	fe976dd2-7421-444c-8d23-8e95045dde5f	5d45565eaa51a930303f1b7dc96c932448ebd4173c08ec9c396f40fb1c0e0a91	2026-03-29 18:24:03.326+00	2026-03-22 18:24:03.389077+00
fcf610af-d15f-41b2-ac85-778e398ff108	36f4622e-c861-40bf-96f4-3b680dd1ed00	fddbc66549501c642ff4b0d0871bbb5bcf2c1e868792d844cecedfac0de2fa0e	2026-03-28 00:15:13.686+00	2026-03-21 00:15:13.749939+00
973da5a0-936a-445b-9dbf-6b5f0e1de817	f92c5ecf-417c-4d22-9381-7e30300bebdd	099c9eb718efdc070c1c82eb93fadeaae463ed5bd34cd4a7b25cbec06c57ad8c	2026-03-28 00:15:28.648+00	2026-03-21 00:15:28.711311+00
e61d2f8d-7ed5-49c0-b9a3-e1251ed583f2	f92c5ecf-417c-4d22-9381-7e30300bebdd	490ce5e058cf83d87e210b99ac08187c59762c569129a055b90c317c41a3133a	2026-03-28 00:15:39.648+00	2026-03-21 00:15:39.71174+00
0e421e82-4685-422e-bddc-c1e4be47f5a8	fe976dd2-7421-444c-8d23-8e95045dde5f	3da81b656b9af8f12986c3bff3c15c9a973d59716f4f20233fb2b9b0ecb2635e	2026-03-29 18:39:15.866+00	2026-03-22 18:39:15.929742+00
97556e0d-2fbd-4131-a96f-cfae8a217326	95a33868-c8a6-494b-b0fb-47faa7a38cf9	2b25250ea4eb82f02b5c4fa7c90f3cacbae9731240da1b93a9bf8e8e297a6320	2026-03-25 00:52:46.61+00	2026-03-18 00:52:46.673332+00
dc7c34ce-fedc-4a7c-b3cf-9317526e748d	fe976dd2-7421-444c-8d23-8e95045dde5f	c664d31fb6bddb8ff0f908735c49e2c2eca1f65408cb5defc684d0498c352a99	2026-03-29 19:54:41.798+00	2026-03-22 19:54:41.861287+00
c5814b32-6df7-4f0d-9b68-bda80778f045	95a33868-c8a6-494b-b0fb-47faa7a38cf9	df4688e3b37c8986e4abee411c7778b07e3fee9a4d400f14786fc3894125e503	2026-03-25 01:24:55.676+00	2026-03-18 01:24:55.741313+00
688c8c9f-84f8-4322-bc8c-4877df6d106c	f304b21d-2197-48da-b2f6-48509abe5d91	2ca90eed10e9fe9ba9be8a1e7b025bd1829e899fc6329592b72309f747f5c7d4	2026-03-29 20:01:29.139+00	2026-03-22 20:01:29.201473+00
65cb6624-fd08-4e9d-8df6-06942401454b	95a33868-c8a6-494b-b0fb-47faa7a38cf9	c02e103d6d22a45ea0ea351ec89bff9df5482d8ff9d0fe2e09cbf32e7afca7d4	2026-03-25 04:16:16.028+00	2026-03-18 04:16:16.091902+00
8142806a-778b-4f10-8cc5-ed0bf427e46a	01b2725e-7290-44c0-b6e3-e48d80ffbe25	c7a7506f531bdd165b032a928af92935f90d7bf5eed6413a5b03a8fbd8ad6d1a	2026-03-29 22:11:12.835+00	2026-03-22 22:11:12.899701+00
109eade9-652f-46c7-a6ec-aca21b604a41	f304b21d-2197-48da-b2f6-48509abe5d91	0bbd9a1857f2cf85ae422e8ef3fe5069feef4216bb8782351682a0a4746d4865	2026-03-30 00:06:42.966+00	2026-03-23 00:06:43.032093+00
63804119-6e96-41e6-a0cf-075e4b8183b0	01b2725e-7290-44c0-b6e3-e48d80ffbe25	56b997ffd6e0e30419bb1845b43c840fc8b7a2ac9682488f7cd08ad86d8d4266	2026-03-30 08:57:09.306+00	2026-03-23 08:57:09.369536+00
4ee6a7dc-32a6-4268-8b77-a01a4a82c4cf	95a33868-c8a6-494b-b0fb-47faa7a38cf9	ef648a55fd35be16771dc7b5c9135ee2949477b579061dbbd242dd554dbbfac0	2026-03-25 06:00:25.267+00	2026-03-18 06:00:25.332178+00
05966f4c-1877-4636-ad47-5f7f4c7113fd	48c6b93e-596e-4583-8562-334e3f21c44b	0df4ee6b33eda796d1b25b484623f17b43391e49c8550e1d6f4cdd90ab5bc6fd	2026-03-25 23:18:46.876+00	2026-03-18 23:18:46.938786+00
316d11cd-2e98-420b-b283-03a1df633796	f304b21d-2197-48da-b2f6-48509abe5d91	6b04539d1f64e02bea08924621a7d459f48b5323bb6de42cc581ee0116a3abd7	2026-03-31 21:14:37.034+00	2026-03-24 21:14:37.097468+00
a5cea87c-48d9-45e8-afaa-77dd2b14c5a0	e912748b-11eb-4c09-a972-83a716a041ce	aaee7881727ff0168d29aea03c01f058112ad5d526ca36ecd5378f591c2ff87f	2026-04-01 06:10:19.766+00	2026-03-25 06:10:19.830735+00
ad872640-178a-4ac3-938d-7e98ef1b6bed	01b2725e-7290-44c0-b6e3-e48d80ffbe25	2662d81aac59da819b30fe6156ad86f5885256d73df0c4f80e5b5d4534fd4cd2	2026-04-01 06:10:43.818+00	2026-03-25 06:10:43.882147+00
0089a21d-db97-4a0c-b307-fec6798d78a8	e912748b-11eb-4c09-a972-83a716a041ce	f1fc8481a65de57d9a9df98096e8fb7ac098ed959067e636930ee1fe7e6790cf	2026-04-01 14:38:52.578+00	2026-03-25 14:38:52.63983+00
212c8563-6026-4e07-a2a9-e893cc6216de	f92c5ecf-417c-4d22-9381-7e30300bebdd	460f654414242edb9a04c5a95d2e71fc824a83b883a4a0a3dc57e6f2fbc1c60d	2026-03-25 23:19:55.558+00	2026-03-18 23:19:55.622035+00
5972f5c1-3510-44c7-827b-9907a09072e5	01b2725e-7290-44c0-b6e3-e48d80ffbe25	729d8d54b82edbebaf424cb8b01d4a19cb3341f1e3fc8c72250acde2e4d403ce	2026-04-01 15:28:06.68+00	2026-03-25 15:28:06.741231+00
a7ad90ad-6b5c-4c20-9c14-638a3fc21a4e	e912748b-11eb-4c09-a972-83a716a041ce	2797586a2d27ecd5e13082782ad450098523e386950e6685cf089fc9d8ad6487	2026-04-01 16:27:05.998+00	2026-03-25 16:27:06.058931+00
5b07d71f-9ca1-4859-a282-907a87a43c6b	fe976dd2-7421-444c-8d23-8e95045dde5f	d4cb063f9062c527229a876d4c7fcef4380c440139e28055c0670111bd3f9fae	2026-03-31 17:08:06.356+00	2026-03-24 17:08:06.419803+00
07eb86d5-fec2-437b-9006-81080c5b974d	f7a9f523-36a0-46e0-b9a9-ea3d1e9a82c9	8bf2ca35de7cf2ec6a004eed6f77cf40a57808fa7f5817ec3579855131873aea	2026-04-01 16:42:56.89+00	2026-03-25 16:42:56.952007+00
5cb5a187-4625-46b7-a82a-46a1e8422428	7650478e-89ac-42be-9523-3251cca02cfe	9157b83152e46665d479e8c6508860d48d10ae560ecad354d1f7f84e75c4d2b1	2026-04-01 16:43:04.234+00	2026-03-25 16:43:04.295259+00
7559d098-d975-42f6-a420-b70527efd78a	01b2725e-7290-44c0-b6e3-e48d80ffbe25	7196ab1d567714298ff65d137c42265f2e011a1de1137b0ccd80fdda5ebf72ac	2026-03-31 20:57:29.22+00	2026-03-24 20:57:29.2833+00
96ce83f8-4948-461b-9cdc-32cd03f9dd2f	1e734062-3359-4ef3-85f4-ed58ef06b756	5d67700978bde4a15411374aa791a6758199c0f957be600bbea5469c36973e3b	2026-04-01 16:43:06.727+00	2026-03-25 16:43:06.788787+00
a73db9cb-4ff9-40d4-afe7-18228e1600a7	234f4867-6717-46fb-b5db-f3c252d1af0a	40875ec32658421f9e4e1195b3940f34b04ed1f859df54232ec0a9964bf04522	2026-04-01 16:43:23.929+00	2026-03-25 16:43:23.990641+00
760fc444-9df9-4720-8395-623513ff6d0e	e912748b-11eb-4c09-a972-83a716a041ce	910a9eb67b1ceb58e90ad59236dc5de6204191a6cf2c0869bd20aa60275bd633	2026-04-01 16:43:36.136+00	2026-03-25 16:43:36.197636+00
5b0c9382-8af7-4c2a-854b-e6ba037a3d5b	f304b21d-2197-48da-b2f6-48509abe5d91	f915fbc42299326ae6e309438dfa11d972af31fcffe6774848c8790cdde0f366	2026-04-01 16:43:50.16+00	2026-03-25 16:43:50.221744+00
6373aedd-284f-4d06-b39c-10530661306c	b35d5a25-51d3-4ea5-9970-f81ce8b01202	f3a7ea0b7b981f329f914326ec51c144b7c2917afeb5ba1e52a313bcee279736	2026-04-01 16:44:04.051+00	2026-03-25 16:44:04.11215+00
4b198011-bb6c-49ab-a730-839c1873ad54	5c8a3c02-41cd-4614-acdc-1473b5ea3e96	e6db564a19b61581c29ab691b4ebffb3e61ad6c610c527fc1a425a0808fa53a1	2026-04-01 16:44:20.528+00	2026-03-25 16:44:20.58985+00
41da13d7-1696-49fb-95b3-79687069efc8	27a83498-64f2-4097-9282-18765449418e	bc26d67eac8a2b1b5f6e65e5e9a6d118cb0ebd48e508be4d2c7fb4fa3c47db56	2026-04-01 16:49:40.82+00	2026-03-25 16:49:40.883091+00
2e2f14f2-8909-4e65-a780-38f637f0cdeb	aef62579-0bca-44c5-b7fb-86aeea3527d3	186e41f9c58e2cbb8acf6cf3504e0fe89871c759d820224f930b3ae0d057816b	2026-04-01 16:49:44.354+00	2026-03-25 16:49:44.41656+00
13b5bd8d-71f7-4126-bd02-cad8f89fe8b0	f304b21d-2197-48da-b2f6-48509abe5d91	4a4df0c9f6649f8077cd707dfdecaa47b804af1e38f0468d993578f3ee895c9a	2026-04-01 18:42:14.171+00	2026-03-25 18:42:14.235564+00
\.


--
-- Data for Name: rotating_questions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rotating_questions (id, question_text, answer_type) FROM stdin;
1	How focused were you during training today?	slider
2	Did you give maximum effort today?	slider
3	How confident did you feel today?	slider
4	How well did you handle mistakes today?	slider
5	How disciplined were you today?	slider
6	How was your energy level today?	slider
7	Did you follow your training plan today?	slider
8	What did you learn today?	text
9	How prepared did you feel today?	slider
10	How satisfied are you with today's performance?	slider
\.


--
-- Data for Name: streaks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.streaks (id, user_id, current_streak, longest_streak, last_entry_date, updated_at) FROM stdin;
7b6103f4-7579-4d27-8ec4-64a11a22e9a5	88fd6040-0af5-467b-b262-d825a26377b7	0	0	\N	2026-03-06 23:28:01.394056+00
40c36e13-52b6-4e93-ae27-fdd4d6ff30b9	afb861fb-80a3-44ac-9a69-31f7468fac6d	0	0	\N	2026-03-06 23:28:05.099273+00
4212efda-23a9-4096-969d-50e86e11e43d	7a82282b-c122-415d-a2a8-32a03560a817	0	0	\N	2026-03-06 23:29:24.455056+00
a36b044f-cdf8-4076-b687-50170e54abb0	21f0c58e-0e2e-4822-bbe9-63846d0fb640	0	0	\N	2026-03-06 23:46:45.617819+00
e2f443a5-69d1-4e32-ad44-d07c40f70df7	fc247b8d-0f9a-4567-a88a-aa2163a62d48	0	0	\N	2026-03-06 23:46:47.896158+00
4b81bf13-8c38-4f3f-8c6b-3dad3a30d1be	f49c8ca6-77a8-4203-b328-2cdb78e0bb9d	1	1	2026-03-06	2026-03-06 23:49:01.960315+00
abb16f98-5195-4bac-a9f5-408649367b0f	e8575d2e-fb01-40ef-9423-94ee47be82e3	0	0	\N	2026-03-06 23:49:46.849968+00
c306e719-9c15-46e8-95f0-65ff3a21c292	50237745-32ab-473b-bdb2-5fd3b748b9ca	0	0	\N	2026-03-06 23:53:09.856259+00
99dcc753-053f-4a12-987a-86bfcbc40e1c	3eba4b7c-1b7e-4c42-9268-b5535b99a5b8	0	0	\N	2026-03-06 23:53:29.380786+00
282a9f43-b5d0-4ba7-a3ae-e62b0a048994	82f59a8c-44b5-4de8-8684-e18fe290b952	1	1	2026-03-07	2026-03-07 00:40:05.096364+00
53d556ee-3193-47bc-8232-e28e531cf430	f304b21d-2197-48da-b2f6-48509abe5d91	0	0	\N	2026-03-20 16:23:06.090602+00
8fe14464-e2f0-4881-b767-05a23519a143	36f4622e-c861-40bf-96f4-3b680dd1ed00	0	0	\N	2026-03-21 00:15:13.612977+00
3e331ded-01e9-490a-88c1-c22c7ccd0ed5	ec11cae0-725b-444c-bfe2-b753d5c642e7	1	1	2026-03-07	2026-03-07 12:45:34.313671+00
3b7eeb82-9290-411b-b896-2d99194b5690	27a83498-64f2-4097-9282-18765449418e	0	0	\N	2026-03-25 16:49:40.752649+00
716f7907-8045-433f-9cf7-fbff1b713afd	aef62579-0bca-44c5-b7fb-86aeea3527d3	0	0	\N	2026-03-25 16:49:44.286336+00
45fdd920-e8e1-411f-876e-ead720c123d3	017404f9-1b31-4004-86be-b42326c05d37	0	0	\N	2026-03-08 17:04:15.277352+00
1a389dea-09c7-48ce-82da-ab7fc347162e	eb6c4785-e090-4e81-b49e-29fdafc01529	0	0	\N	2026-03-08 19:50:30.091906+00
bb036e88-a1a9-4aa6-b7f8-73c0289a31df	fe976dd2-7421-444c-8d23-8e95045dde5f	0	2	2026-03-22	2026-03-24 17:08:07.180255+00
db8c2c39-81ce-4f78-99dd-515c4dc443fe	01b2725e-7290-44c0-b6e3-e48d80ffbe25	0	1	2026-03-22	2026-03-24 20:57:30.034762+00
25d73c31-1b87-4c62-b1d0-aeb75f14ddb9	e5ead113-0238-480c-8938-2b7dbfa7d5cb	1	1	2026-03-24	2026-03-24 21:17:11.244968+00
77a7b95f-b925-4a58-b07a-03d72091d954	e912748b-11eb-4c09-a972-83a716a041ce	12	12	2026-03-25	2026-03-25 16:31:20.741455+00
d8a5592c-b850-42cf-9bdc-79fc87c37139	f7a9f523-36a0-46e0-b9a9-ea3d1e9a82c9	0	0	\N	2026-03-25 16:42:56.817493+00
8e397f8d-6a35-4fbe-9f6a-b9addf02b936	7650478e-89ac-42be-9523-3251cca02cfe	0	0	\N	2026-03-25 16:43:04.16552+00
60d3b46d-c6a5-4503-b946-d28ad19fe2d6	1e734062-3359-4ef3-85f4-ed58ef06b756	0	0	\N	2026-03-25 16:43:06.659047+00
e84ad529-d9b5-4546-873f-c60f1e76d9ea	95a33868-c8a6-494b-b0fb-47faa7a38cf9	0	1	2026-03-08	2026-03-12 16:31:31.523327+00
2b34f2d2-5391-44ed-bc3d-cb370700ed3d	234f4867-6717-46fb-b5db-f3c252d1af0a	0	0	\N	2026-03-25 16:43:23.860982+00
0977ebc3-abda-4f46-b61c-d2f7d7095a29	48c6b93e-596e-4583-8562-334e3f21c44b	0	0	\N	2026-03-14 03:39:12.61181+00
df788c94-8985-4578-bce7-843e0fb4d3ad	8706ac7c-7ef6-493e-9cb9-60d62c980824	0	0	\N	2026-03-14 16:01:33.168336+00
0fed27f3-96ad-4a1f-965d-1991364b8c08	2323483f-835d-4361-ab41-12ab482b4452	0	0	\N	2026-03-14 19:18:48.011736+00
abdd15ac-fc4e-4871-b263-029809b18cc2	5c8a3c02-41cd-4614-acdc-1473b5ea3e96	0	0	\N	2026-03-14 19:21:23.012397+00
3105cfbe-475d-4d3b-8680-71cd04ac25e6	19cf6239-4535-4c93-b1a6-10bd26ecc731	0	0	\N	2026-03-14 19:24:01.125546+00
09ee16c6-cc01-4acd-b528-2fb8a574fb67	0192f3dc-722c-46ed-acf8-3f50f0fd36ba	0	0	\N	2026-03-14 19:24:17.416972+00
ee95927b-533c-460f-ae0c-fee61a6a5ad3	da6e7fc1-1177-4ffd-a5de-05e7a3cc450f	0	0	\N	2026-03-14 19:32:33.195285+00
94831836-16e8-43ef-b349-97ff25e9dc11	f59787cb-2218-46d5-bc02-0c64ee1ee650	0	0	\N	2026-03-14 20:15:12.612358+00
5ee5298d-d3e5-436e-bf80-169f7a39a7db	88bc0c51-1e6a-40e2-90c9-76b41b5be14d	0	0	\N	2026-03-14 20:22:08.87978+00
c5d5c2bd-e7bc-4992-b6b4-c35b0d9a6e6b	b35d5a25-51d3-4ea5-9970-f81ce8b01202	0	0	\N	2026-03-14 20:22:55.771141+00
ccadaa6e-25ad-4436-9fa5-4f24d2c3018e	be742a56-48a7-416d-812d-51d087d4cca2	0	0	\N	2026-03-14 20:30:27.09647+00
52679e58-5044-4bff-920d-7e606c0660cf	b38f9511-2aac-4b68-ba56-12f8ad9b7313	1	1	2026-03-16	2026-03-16 23:55:14.401932+00
869d018f-b3c4-42ca-9a60-4a9ad41d1965	f92c5ecf-417c-4d22-9381-7e30300bebdd	0	0	\N	2026-03-18 23:19:55.4864+00
336087b0-5f4d-463c-aa4e-a9834ce8f4d1	77c20696-bf22-4b3e-b878-fcc5cc0417aa	0	0	\N	2026-03-12 07:22:04.440045+00
1903b0cd-d67e-4772-ae95-632450b9b676	65d4c2dd-5e2f-4d53-8782-d4cda089d817	0	0	\N	2026-03-09 17:01:32.184562+00
1a2859c6-b3d7-44e1-bed4-c7c9aae79690	d87d46ec-90ea-4b6e-b05a-a92c281e1d4e	0	0	\N	2026-03-09 17:09:50.998317+00
b1cdd6a8-0045-4ad6-9383-0a06e5dcf0d8	6d862470-eed7-4154-ad3d-e4778db98b80	0	0	\N	2026-03-09 17:13:43.743208+00
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscriptions (id, user_id, apple_transaction_id, product_id, status, trial_start, trial_end, current_period_start, current_period_end, created_at, updated_at) FROM stdin;
382a4069-e268-42c8-bf85-baac879ef78e	ec11cae0-725b-444c-bfe2-b753d5c642e7	0	com.hakanalsancak.ican.premium.monthly	active	\N	\N	2026-03-07 12:44:50.774241+00	2026-04-07 11:44:50.736+00	2026-03-07 12:44:50.774241+00	2026-03-07 12:44:50.774241+00
ff92ec11-e1a9-40a1-acf7-59ad95b19459	95a33868-c8a6-494b-b0fb-47faa7a38cf9	0	com.hakanalsancak.ican.premium.monthly	active	\N	\N	2026-03-09 16:59:39.072159+00	2026-04-09 15:59:39.005+00	2026-03-09 16:59:39.072159+00	2026-03-09 16:59:39.072159+00
9e9beaf2-a681-440a-be43-9b87273ac887	d87d46ec-90ea-4b6e-b05a-a92c281e1d4e	0	com.hakanalsancak.ican.premium.monthly	active	\N	\N	2026-03-09 17:11:23.83753+00	2026-04-09 16:11:23.774+00	2026-03-09 17:11:23.83753+00	2026-03-09 17:11:23.83753+00
c6277f78-20d7-4233-8ddb-cbe367d50648	6d862470-eed7-4154-ad3d-e4778db98b80	0	com.hakanalsancak.ican.premium.monthly	active	\N	\N	2026-03-09 17:13:57.689073+00	2026-04-09 16:13:57.69+00	2026-03-09 17:13:57.689073+00	2026-03-09 17:13:57.689073+00
9cae84d5-42ba-4af5-a06e-b75e27305516	e912748b-11eb-4c09-a972-83a716a041ce	0	com.hakanalsancak.ican.premium.monthly	active	\N	\N	2026-03-13 21:46:34.33596+00	2026-04-13 20:46:34.258+00	2026-03-13 21:46:34.33596+00	2026-03-13 21:46:34.33596+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, full_name, apple_id, google_id, sport, mantra, notification_frequency, timezone, onboarding_completed, created_at, updated_at, age, country, gender, team, competition_level, "position", primary_goal, username, profile_photo_url) FROM stdin;
88fd6040-0af5-467b-b262-d825a26377b7	guest_94FE73C4@ican.app	$2a$12$EDP45r/7rdxlId2YCGnkou00balWcY9gLvdicKUGlf70TW/DIqp7e	\N	\N	\N	basketball	I’m him.	1	UTC	t	2026-03-06 23:28:01.37403+00	2026-03-06 23:28:01.485049+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
afb861fb-80a3-44ac-9a69-31f7468fac6d	guest_173715E1@ican.app	$2a$12$j03rX3sABhwjCkriC2Y8beqCnvSzvYS4z3bxkjMXrGWU3stZJz3kW	\N	\N	\N	basketball	I’m him.	1	UTC	t	2026-03-06 23:28:05.088669+00	2026-03-06 23:28:05.130404+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
7a82282b-c122-415d-a2a8-32a03560a817	guest_test123@ican.app	$2a$12$OZQaS14pZ31nSvuVcvO23.W.IV8/kakK6VpCLR7hokQ8eugfdYnNC	\N	\N	\N	soccer	\N	1	UTC	f	2026-03-06 23:29:24.447565+00	2026-03-06 23:29:24.447565+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
21f0c58e-0e2e-4822-bbe9-63846d0fb640	guest_1BD6B7AA@ican.app	$2a$12$ELfcM0Rgj26jFYSkSBqbfOcMCdbal46PQ2PpnC0PrhaSyG3xCsH7y	\N	\N	\N	basketball	I am him	3	UTC	t	2026-03-06 23:46:45.600709+00	2026-03-06 23:46:45.702369+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
fc247b8d-0f9a-4567-a88a-aa2163a62d48	guest_27D716D1@ican.app	$2a$12$jCDryWFw4t73G.rZv8ZaLe1pK8sz1lySzkBCzs38UI3T56lXgzCm2	\N	\N	\N	basketball	I am him	3	UTC	t	2026-03-06 23:46:47.886307+00	2026-03-06 23:46:47.931364+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
f49c8ca6-77a8-4203-b328-2cdb78e0bb9d	guest_338269B1@ican.app	$2a$12$/Mhz4t1jjNyXm1N4mcC.ceK5gjfU.w3SaUkH8lI3SG2H4QboV4Sza	\N	\N	\N	basketball	I am him	3	UTC	t	2026-03-06 23:46:51.764165+00	2026-03-06 23:46:51.814332+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
e8575d2e-fb01-40ef-9423-94ee47be82e3	guest_AD7768ED@ican.app	$2a$12$JTnBFRzWCIJaDMv11mjqcO5f3HtBt9/W.ajfhAGs76Gy82ERtyiVe	\N	\N	\N	soccer	I	1	UTC	t	2026-03-06 23:49:46.838561+00	2026-03-06 23:49:46.900224+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
50237745-32ab-473b-bdb2-5fd3b748b9ca	guest_BC425034@ican.app	$2a$12$S/3Bvp8bLCy9iX.qPHBR3.wUSMXhQLw9xk9dw1TTQ78Tkx3Wt9lKC	\N	\N	\N	boxing	I	3	UTC	t	2026-03-06 23:53:09.846257+00	2026-03-06 23:53:09.886344+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
3eba4b7c-1b7e-4c42-9268-b5535b99a5b8	guest_4E27DD6D@ican.app	$2a$12$4a88cZL8WVO/xvfAhoCWsOHH5/gTXNSLcagye1WB2HwYwc07WzGn6	\N	\N	\N	cricket	\N	1	UTC	t	2026-03-06 23:53:29.371625+00	2026-03-06 23:53:29.431079+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
82f59a8c-44b5-4de8-8684-e18fe290b952	guest_B876B450@ican.app	$2a$12$XEsKG/7DU8R8plljYyVch.FAVzxJ3XTSN82nZ/E2I.ynrI1s7VNnm	\N	\N	\N	basketball	I	3	UTC	t	2026-03-07 00:11:35.131963+00	2026-03-07 00:11:35.206084+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
36f4622e-c861-40bf-96f4-3b680dd1ed00	vivensvitacontact@gmail.com	\N	Vivens Vita	\N	103454391616381904162	soccer	\N	1	UTC	f	2026-03-21 00:15:13.467214+00	2026-03-21 00:15:13.467214+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
ec11cae0-725b-444c-bfe2-b753d5c642e7	guest_69E9CD64@ican.app	$2a$12$XVmHt8I3vQLZtfTm3.91YuV2j7YxjwPVvqVx5mtpB.h95fEtXTHly	\N	\N	\N	tennis	I am here.	2	UTC	t	2026-03-07 12:43:37.542362+00	2026-03-07 12:43:37.607932+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
e5ead113-0238-480c-8938-2b7dbfa7d5cb	guest_C00B41C0@guest.ican.app	$2a$12$jPzMRvnvn9b2I1dxSLMTweYHn9CwyiqP3UJiGqjvKc74HoIM5uYiK	Josh	\N	\N	basketball	Limits are an illusion.	1	UTC	t	2026-03-24 21:17:03.24811+00	2026-03-24 21:17:04.161145+00	18	GB	male	\N	amateur	Shooting Guard	improve_performance	josh300	\N
f7a9f523-36a0-46e0-b9a9-ea3d1e9a82c9	guest_A7105360@guest.ican.app	$2a$12$0DXV22auxwfHm9Qfzl8do.2F32syut8.DRwMYEN7GLJyH5RWLmz.C	emre	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:42:56.646577+00	2026-03-25 16:42:56.646577+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
7650478e-89ac-42be-9523-3251cca02cfe	guest_748C6568@guest.ican.app	$2a$12$WTVaKm.tg53liTpfSUaY3O64UU/hn/6kV2lpCJm3pXDWZY27wZHaW	emre	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:43:04.03605+00	2026-03-25 16:43:04.03605+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
01b2725e-7290-44c0-b6e3-e48d80ffbe25	hakanalsancak09@gmail.com	$2a$12$DvBTx/ASw9jEQlo/z8bZz.g97fvu4h/i8hv4p8iI3lQu.3BXtrpJ6	Kelly Smith	\N	114223524831471322996	tennis	Stay focused.	2	UTC	t	2026-03-22 18:24:48.682883+00	2026-03-22 19:54:03.728307+00	20	DE	female	Maidstone Tennis Academy	amateur	Doubles	build_consistency	kelly87	https://res.cloudinary.com/dqcn9sj4b/image/upload/v1774209242/ican/profile-photos/01b2725e-7290-44c0-b6e3-e48d80ffbe25.jpg
95a33868-c8a6-494b-b0fb-47faa7a38cf9	hakanalsancak5@gmail.com	\N	Hakan	\N	104074728695449801172	boxing	Rise to the challenge.	2	UTC	t	2026-03-08 14:04:48.747593+00	2026-03-18 04:27:47.415483+00	18	GB	\N	\N	\N	\N	\N	emreee	\N
017404f9-1b31-4004-86be-b42326c05d37	hakan@gmail.com	$2a$12$yfPZZXc86HLJ/scJSDm8cejDyF54L.YLqhRYItb27X6BzMMap38tO	Hakan	\N	\N	soccer	Impossible is nothing.	1	UTC	t	2026-03-08 17:04:15.258425+00	2026-03-08 17:04:15.337961+00	18	\N	\N	\N	\N	\N	\N	\N	\N
eb6c4785-e090-4e81-b49e-29fdafc01529	hakana@gmail.com	$2a$12$9pr0WsumugxHuLw7bzAq/e0Y3mZLHdzsbQNEyIYquTT2V6LpH56P.	Hakan	\N	\N	soccer	Stick to it.	2	UTC	t	2026-03-08 19:50:30.076787+00	2026-03-08 19:50:30.15873+00	18	\N	\N	\N	\N	\N	\N	\N	\N
1e734062-3359-4ef3-85f4-ed58ef06b756	guest_A1D40DB5@guest.ican.app	$2a$12$Qhua7XapAzft94cNZpRx8OHcJ7SHBCco0JEPhKLW6clN93XX.R7Km	emre	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:43:06.529349+00	2026-03-25 16:43:06.529349+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
234f4867-6717-46fb-b5db-f3c252d1af0a	guest_6C828AE2@guest.ican.app	$2a$12$SEjbHXMedDCAPgMc366F7.gfpawK1jOBkAsHd9N.Oe2nlIRIf.5YO	emre	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:43:23.731188+00	2026-03-25 16:43:23.731188+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
27a83498-64f2-4097-9282-18765449418e	guest_B201BAF0@guest.ican.app	$2a$12$5xKxg.hoP2z8a5lfCI3mjuvP9PLN0Z4jO7NyEvefL8FHdf581f5C6	Jay	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:49:40.622558+00	2026-03-25 16:49:40.622558+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
aef62579-0bca-44c5-b7fb-86aeea3527d3	guest_1020AE3E@guest.ican.app	$2a$12$kno/Qc75huhSt2/5.X0ATO6C9PoCeGd6lQA4kGcxzy7QYrgQF..m.	Jay	\N	\N	soccer	\N	1	UTC	f	2026-03-25 16:49:44.156274+00	2026-03-25 16:49:44.156274+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
f304b21d-2197-48da-b2f6-48509abe5d91	hakanalsancak02@gmail.com	\N	Tyler	\N	108022706794721361855	tennis	Stay focused.	2	UTC	t	2026-03-20 16:23:05.943235+00	2026-03-25 18:42:43.390537+00	18	US	male	\N	semi_pro	Singles	mental_strength	tyler987	https://res.cloudinary.com/dqcn9sj4b/image/upload/v1774464162/ican/profile-photos/f304b21d-2197-48da-b2f6-48509abe5d91.jpg
fe976dd2-7421-444c-8d23-8e95045dde5f	alsancakhakan0@gmail.com	\N	Cameron	\N	110294010436484000160	boxing	Say it	2	UTC	t	2026-03-14 14:41:59.849901+00	2026-03-21 00:19:41.979016+00	18	GB	male	Evolution Boxing Club	semi_pro	Featherweight	improve_performance	cameronmay	https://res.cloudinary.com/dqcn9sj4b/image/upload/v1774052381/ican/profile-photos/fe976dd2-7421-444c-8d23-8e95045dde5f.jpg
65d4c2dd-5e2f-4d53-8782-d4cda089d817	guest_3FAD2FA4@ican.app	$2a$12$onbM10TPPzg2kdINxjS0oemzqME98hm6CVUdamNBLaAZFG0UuPPjS	Jamie	\N	\N	football	\N	1	UTC	t	2026-03-09 17:01:32.166749+00	2026-03-09 17:01:32.229252+00	18	GB	\N	\N	\N	\N	\N	\N	\N
d87d46ec-90ea-4b6e-b05a-a92c281e1d4e	jamie@gmail.com	$2a$12$F14RdjeIz0mQ94HzCkrWV.UMgKEgQ6XARNYtNmNPfpHOJkPNplx5q	Jamie	\N	\N	football	\N	1	UTC	t	2026-03-09 17:09:50.986049+00	2026-03-09 17:09:51.05301+00	18	GB	\N	\N	\N	\N	\N	\N	\N
6d862470-eed7-4154-ad3d-e4778db98b80	hakanas@gmail.com	$2a$12$EiJBk3JspG8Uy110cO/K7ODIi16P3HteYVawEOw..5zo4EDPL.5cu	Hakana	\N	\N	tennis	Stay focused.	3	UTC	t	2026-03-09 17:13:43.733184+00	2026-03-09 17:13:43.787296+00	18	GB	\N	\N	\N	\N	\N	\N	\N
77c20696-bf22-4b3e-b878-fcc5cc0417aa	emre000@gmail.com	$2a$12$6gyRVG6DJwEJbZjhf1LzNe0p7ewyRspMKAFCwBR0aeSIQb4l8CkLS	Emre	\N	\N	basketball	Limits are an illusion.	2	UTC	t	2026-03-12 07:22:04.431851+00	2026-03-12 07:22:04.51012+00	17	TR	male	Crucaders U18	amateur	Shooting Guard	build_consistency	emresancar0	\N
48c6b93e-596e-4583-8562-334e3f21c44b	hakanalsancak01@gmail.com	\N	Hakan Alsancak	\N	116208839599950825605	soccer	\N	1	UTC	f	2026-03-14 03:39:12.473851+00	2026-03-14 03:39:12.473851+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
8706ac7c-7ef6-493e-9cb9-60d62c980824	guest_89F76D82@guest.ican.app	$2a$12$sf7SOXBt8UCFU56QzzZtk.0iIhVlejUU59dgurU1z10giRRhB1ZrK	Tyler	\N	\N	soccer	Hi	2	UTC	t	2026-03-14 16:01:32.973412+00	2026-03-14 16:01:34.070778+00	18	GB	male	\N	amateur	Central Midfielder	improve_performance	tylerwood	\N
2323483f-835d-4361-ab41-12ab482b4452	guest_68DE56B1@guest.ican.app	$2a$12$KuqzOqFiQjLsUzMHs77qteDvYKZeXxLvqDhARl/pMx6SgUL3RgYbq	Polsh	\N	\N	tennis	Ball is mine	2	UTC	t	2026-03-14 19:18:47.867491+00	2026-03-14 19:18:48.856627+00	20	US	female	Maidstone Tennis Academy	amateur	Singles	build_consistency	polsh12345	\N
5c8a3c02-41cd-4614-acdc-1473b5ea3e96	vivensvitabusiness@gmail.com	\N	Vivens Vita	\N	116370256882279455139	soccer	\N	1	UTC	f	2026-03-14 19:21:22.876512+00	2026-03-14 19:23:18.525681+00	\N	GB	\N	\N	\N	\N	\N	\N	\N
19cf6239-4535-4c93-b1a6-10bd26ecc731	guest_395D8002@guest.ican.app	$2a$12$DmQIujdBG5/0TO6N3tNBeOerUbMAvmh5pGkF98VFH6OVP7DJkW4OG	polo	\N	\N	football	Limits are an illusion.	2	UTC	t	2026-03-14 19:24:00.985534+00	2026-03-14 19:24:02.009009+00	20	DE	female	\N	semi_pro	Offensive Line	build_consistency	poloooo	\N
0192f3dc-722c-46ed-acf8-3f50f0fd36ba	leventw2005@gmail.com	\N	Levent A	\N	117214191998781002703	soccer	\N	1	UTC	f	2026-03-14 19:24:17.278121+00	2026-03-14 19:30:39.427572+00	\N	GB	\N	\N	\N	\N	\N	\N	\N
da6e7fc1-1177-4ffd-a5de-05e7a3cc450f	guest_6E260873@guest.ican.app	$2a$12$ByQrl.pGHbGc8..07f.do.o1IoOwkMRGEQueKOifWvKh.elVHOXIG	\N	\N	\N	football	Rise to the challenge.	1	UTC	t	2026-03-14 19:32:33.048826+00	2026-03-14 19:32:37.270708+00	18	GB	\N	\N	amateur	Tight End	build_consistency	hahaha	\N
f59787cb-2218-46d5-bc02-0c64ee1ee650	guest_FF6833C7@guest.ican.app	$2a$12$fG422Ubwqg5rXqXQxhE4y.zHk93/5MWehNK.VAPS7FspeX7FEtfzq	Joe	\N	\N	basketball	Impossible is nothing.	1	UTC	t	2026-03-14 20:15:12.46318+00	2026-03-14 20:15:13.39333+00	19	GB	male	\N	professional	Point Guard	build_consistency	joe1234	\N
88bc0c51-1e6a-40e2-90c9-76b41b5be14d	guest_28656174@guest.ican.app	$2a$12$1d964p0JFf914nNjBCALa.Ij/2IpfenXuAG06/NoDbwoxRwcA83ku	Joe	\N	\N	cricket	Stick to it.	3	UTC	t	2026-03-14 20:22:08.746562+00	2026-03-14 20:22:09.723666+00	26	TR	male	Unie	elite	Wicket-Keeper	mental_strength	joes1	\N
b35d5a25-51d3-4ea5-9970-f81ce8b01202	hakanalsancak08@gmail.com	\N	Hakan Alsancak	\N	102072508812412455804	soccer	\N	1	UTC	f	2026-03-14 20:22:55.640465+00	2026-03-14 20:22:55.640465+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
be742a56-48a7-416d-812d-51d087d4cca2	guest_D7EFD730@guest.ican.app	$2a$12$7QEdIjmz6eNEcDzVigkex.ewocxRa0qqT1vE/wwklEeDN.DT.4pG6	Kei	\N	\N	tennis	Dream bigger.	3	UTC	t	2026-03-14 20:30:26.952877+00	2026-03-14 20:30:27.917492+00	25	US	female	\N	professional	Both	build_consistency	kei	\N
e912748b-11eb-4c09-a972-83a716a041ce	hakanalsancak03@gmail.com	\N	Hakan	001132.df2c85c2cb8e41639979050131d4891d.1504	100044858259688499640	boxing	I’m here	2	UTC	t	2026-03-13 16:52:12.177601+00	2026-03-25 17:55:22.763789+00	19	GB	male	ABC Boxing Club	amateur	Heavyweight	reach_next_level	hakanalsancak	https://res.cloudinary.com/dqcn9sj4b/image/upload/v1774461311/ican/profile-photos/e912748b-11eb-4c09-a972-83a716a041ce.jpg
b38f9511-2aac-4b68-ba56-12f8ad9b7313	guest_A821A958@guest.ican.app	$2a$12$DGW77NnK2tihz228txqNqerrey/IriWflLEyUvkU4r4Kl1rJ8mh5W	g he d	\N	\N	tennis	Limits are an illusion.	1	UTC	t	2026-03-16 23:54:46.574695+00	2026-03-16 23:54:47.539351+00	18	GB	male	uy	semi_pro	Singles	improve_performance	yyyyt	\N
f92c5ecf-417c-4d22-9381-7e30300bebdd	hakanalsancak04@gmail.com	\N	Hakan Yildiz	\N	106793054455686604496	soccer	\N	1	UTC	f	2026-03-18 23:19:55.343967+00	2026-03-18 23:19:55.343967+00	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Name: ai_reports ai_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_reports
    ADD CONSTRAINT ai_reports_pkey PRIMARY KEY (id);


--
-- Name: chat_usage chat_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_usage
    ADD CONSTRAINT chat_usage_pkey PRIMARY KEY (id);


--
-- Name: chat_usage chat_usage_user_id_usage_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_usage
    ADD CONSTRAINT chat_usage_user_id_usage_date_key UNIQUE (user_id, usage_date);


--
-- Name: daily_entries daily_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_pkey PRIMARY KEY (id);


--
-- Name: daily_entries daily_entries_user_id_entry_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_user_id_entry_date_key UNIQUE (user_id, entry_date);


--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_token_key UNIQUE (user_id, token);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_sender_id_receiver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_id_friend_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_friend_id_key UNIQUE (user_id, friend_id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: rotating_questions rotating_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotating_questions
    ADD CONSTRAINT rotating_questions_pkey PRIMARY KEY (id);


--
-- Name: streaks streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streaks
    ADD CONSTRAINT streaks_pkey PRIMARY KEY (id);


--
-- Name: streaks streaks_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streaks
    ADD CONSTRAINT streaks_user_id_key UNIQUE (user_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: users users_apple_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_apple_id_key UNIQUE (apple_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_chat_usage_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_usage_user_date ON public.chat_usage USING btree (user_id, usage_date);


--
-- Name: idx_entries_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entries_user_created ON public.daily_entries USING btree (user_id, created_at DESC);


--
-- Name: idx_entries_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entries_user_date ON public.daily_entries USING btree (user_id, entry_date DESC);


--
-- Name: idx_feedback_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_user ON public.feedback USING btree (user_id);


--
-- Name: idx_friend_requests_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_requests_receiver ON public.friend_requests USING btree (receiver_id, status);


--
-- Name: idx_friend_requests_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_requests_sender ON public.friend_requests USING btree (sender_id, status);


--
-- Name: idx_friendships_friend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_friend ON public.friendships USING btree (friend_id);


--
-- Name: idx_friendships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_user ON public.friendships USING btree (user_id);


--
-- Name: idx_goals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goals_user ON public.goals USING btree (user_id, goal_type);


--
-- Name: idx_notif_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_user ON public.notification_log USING btree (user_id, sent_at DESC);


--
-- Name: idx_refresh_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_reports_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_user_type ON public.ai_reports USING btree (user_id, report_type, period_start DESC);


--
-- Name: idx_users_apple_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_apple_id ON public.users USING btree (apple_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_google_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_google_id ON public.users USING btree (google_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: ai_reports ai_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_reports
    ADD CONSTRAINT ai_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_usage chat_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_usage
    ADD CONSTRAINT chat_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_entries daily_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: device_tokens device_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_friend_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: goals goals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_log notification_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: streaks streaks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streaks
    ADD CONSTRAINT streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict YXEeHSzhccNmWLLTPXKNwsOoHXqGoEIfU149zsHBTc6TeuUkwpbdfVtmTl18ajA


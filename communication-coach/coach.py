#!/usr/bin/env python3
import os
import sys
import time
import json
import textwrap
from datetime import datetime

# ANSI Color Codes for beautiful terminal styling
class Style:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# Clear terminal screen helper
def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

# Dynamic paragraph wrapping helper to prevent horizontal terminal overflow
def print_wrapped(text, style_color=''):
    try:
        # Get terminal size, default to 75 columns
        width = os.get_terminal_size().columns - 4
    except Exception:
        width = 75
        
    paragraphs = text.split('\n\n')
    for p in paragraphs:
        if not p.strip():
            continue
        wrapped = textwrap.fill(p, width=width)
        print(f"{style_color}{wrapped}{Style.ENDC}\n")

# Save history function
def save_practice_log(question, category, duration, rating, notes):
    log_file = os.path.join(os.path.dirname(__file__), 'coach_history.json')
    history = []
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r') as f:
                history = json.load(f)
        except Exception:
            pass
    
    log_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "category": category,
        "question": question,
        "duration_seconds": duration,
        "self_rating": rating,
        "notes": notes
    }
    history.append(log_entry)
    
    with open(log_file, 'w') as f:
        json.dump(history, f, indent=4)

# Print V.A.N.I. Framework Overview
def print_framework():
    clear_screen()
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}               🎙️  THE V.A.N.I. INTERVIEW SPEAKING FRAMEWORK 🎙️             {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    print(f"To crack a {Style.GREEN}10+ LPA role{Style.ENDC} as a BCA graduate, your communications must sound as premium")
    print("and structured as the systems you build. Apply this formula:")
    print("\n" + f"{Style.BOLD}{Style.CYAN}V - Vocal Articulation & Clarity:{Style.ENDC}")
    print("    • Speak at a controlled 120-140 words per minute. Never rush your thoughts.")
    print("    • Use precise technical jargon (e.g., 'updates React state causing a re-render' instead of 'shows data').")
    print("    • Eliminate fillers like 'um', 'like', 'you know', 'basically'. Pause silently instead.")
    
    print("\n" + f"{Style.BOLD}{Style.CYAN}A - Active Listening & Alignment:{Style.ENDC}")
    print("    • Pause for 2 seconds after the interviewer finishes before speaking.")
    print("    • Align expectations: 'So to confirm, you want me to design the database schema for the Pomodoro tracking session?'")
    
    print("\n" + f"{Style.BOLD}{Style.CYAN}N - Narrative Structuring (STAR Method):{Style.ENDC}")
    print("    • S - SITUATION: Set the context (e.g., 'While building ThinkEra, students struggled to compile code instantly...').")
    print("    • T - TASK: State the challenge ('I had to design an isolated, fast compilation container...').")
    print("    • A - ACTION: What YOU did ('I built a Next.js playground with a Node/Express backend that ran evaluation scripts...').")
    print("    • R - RESULT: Quantifiable success ('Achieved 100% in-browser practice, eliminating external IDE friction.').")
    
    print("\n" + f"{Style.BOLD}{Style.CYAN}I - Iterative Self-Correction & Review:{Style.ENDC}")
    print("    • Record your answers, analyze where your sentence flow broke down, and repeat.")
    print("\nPress [Enter] to return to the Main Menu...")
    input()

# Load interview questions dataset - NOW ENHANCED WITH DYNAMIC CODEBASE REPOSITORY INTEGRATION
def get_questions():
    return {
        "1": {
            "name": "HR & Behavioral (STAR Method Focused)",
            "questions": [
                {
                    "q": "Tell me about yourself.",
                    "strategy": "Structure: 1. Present (BCA final-year student, full-stack + AI dev), 2. Past (built 3 production products), 3. Future (seeking a high-growth startup where you can build fast). Keep it under 2 minutes.",
                    "model": "Hi, I am Jayesh Kumar, a final-year Computer Applications student specializing in Full-Stack development and AI systems integration. Over the last two years, I've focused heavily on building production-grade software products from scratch rather than just studying theory. For instance, I built 'ThinkEra', a full-stack DSA learning platform with a live coding editor and built-in AI mentor, and 'VANI', a fully offline-capable AI voice assistant. My goal is to join a fast-paced product engineering team where I can solve high-scale engineering problems, apply my AI integration skills, and write clean, robust code."
                },
                {
                    "q": "Why should we hire a BCA fresher for a premium engineering role (10+ LPA)?",
                    "strategy": "Pitch your practical skills as vastly superior to the average theoretical engineer. Point out your track record of building production products (Next.js, Node, React Native, Ollama, Vector Embeddings).",
                    "model": "While many degree holders spend four years solely on theoretical textbooks, I have focused on shipping actual, running applications. I have designed and deployed a Next.js full-stack platform (ThinkEra), developed a cross-platform React Native habit tracker (KRIYA), and built a local AI voice assistant with vector search (VANI). I understand REST APIs, SQL indexing, vector embeddings, and modular frontend architectures. I don't need hand-holding; I am ready to write production-grade code on day one. You are hiring my shipping speed, self-starting nature, and technical execution capacity, not a degree certificate."
                },
                {
                    "q": "Describe a difficult technical bug you solved.",
                    "strategy": "Use the STAR method. Describe a problem in ThinkEra (e.g., code editor evaluation sandbox security or state management lag) or VANI (e.g., latency in LLM responses or microphone stream synchronization).",
                    "model": "While building 'VANI', my offline AI voice assistant, I hit a major bottleneck: the local Ollama LLM execution on consumer laptops caused a 5-second response latency, ruining the voice assistant conversation flow. To solve this, I designed a hybrid execution system. I wrote a command parser in Python that first checks for high-priority local intents. For general conversation, I integrated a LiveKit streaming pipe connected to the Gemini API, streaming audio chunks back. I also built a fallback switch so that if the internet drops, it seamlessly routes queries to the local Ollama model. This hybrid pipeline cut vocal latency from 5 seconds to under 800ms while maintaining 100% offline reliability."
                }
            ]
        },
        "2": {
            "name": "Project Architecture & Resume Deep Dive",
            "questions": [
                {
                    "q": "How did you design and implement the in-browser code editor and evaluator in ThinkEra?",
                    "strategy": "Explain the full stack workflow: Frontend (Monaco/Textarea) -> API Request -> compilation container / sandbox evaluation -> returning JSON test cases status. Explain security precautions.",
                    "model": "In ThinkEra, the goal was a frictionless DSA practicing UI. I built the frontend with React.js using a responsive layout styled via Tailwind CSS, rendering code inputs. When the student hits 'Submit', the frontend triggers a POST request containing the source code and problem ID to our Node.js/Express backend. The backend fetches the official test cases from our PostgreSQL database. To run the evaluation safely, the backend initializes a sandboxed process, feeds the input stream into the compiled binary (e.g., using child processes and resource limits on CPU/RAM), compares stdout against the target output, and returns a detailed test case evaluation JSON. This gives students instant, interactive compiler feedback."
                },
                {
                    "q": "How did you design and implement the automatic content moderation system in TechEra (ThinkEra)? What are the database schema implications of the two-strike ban policy?",
                    "strategy": "Focus on: 1. Heuristics & Matching: Regex scans on the API route (POST /api/community/posts) before database inserting to block profanity/explicit terms. 2. PostgreSQL Cascade Deletes: Explain how calling delete on the users table triggers ON DELETE CASCADE on attempts, posts, comments, and streaks, saving server compute. 3. Security layers: clerk integration with Supabase admin bypass.",
                    "model": "In TechEra, content safety is fully automated on Next.js serverless routes. When a post is submitted, the API scans the full text against banned regex patterns matching English and Hindi/Hinglish gaaliyan, explicit, and hate speech. If a violation is hit, the system updates a warning record in the database. On the first warning, the post is blocked and the user is warned. On the second warning, the user's account is permanently deleted. From a database design perspective, I implemented this utilizing PostgreSQL's ON DELETE CASCADE constraints. By executing a delete query on the primary Clerk-synchronized 'users' record using a Supabase service role client, PostgreSQL automatically triggers cascading deletions of the user's streaks, attempts, posts, and comments in a single transactional operation, ensuring absolute data integrity."
                },
                {
                    "q": "How does Vani solve the 'accent gap' in Text-To-Speech (TTS) engines when speaking Hinglish? Explain the design of your strict phonetic rewrite layer.",
                    "strategy": "Outline: 1. Core Problem: TTS engines read Hinglish phonetically wrong. 2. Solution: Vani's strict phonetic compiler layer (hinglish_speech.py). 3. Compilation Pipeline: Multi-word phrase regex scans (longest-match first) followed by anchored token word boundaries using whole-word dictionary map. Give concrete phonetic mappings.",
                    "model": "To solve the accent gap where English TTS engines mispronounce Hinglish words (like 'theek', 'hoon', 'kyun') with awkward mechanical English accents, I designed a strict phonetic compiler layer in Vani (hinglish_speech.py). When Vani generates a textual response, before sending it to the audio TTS driver, it compiles the text through a two-stage regex pipeline. The first pass executes a longest-phrase match replacing multi-word sequences (e.g., 'koi baat nahi' into 'ko-ee baat na-hi'). The second pass breaks remaining text into individual tokens, executing boundary-anchored matches replacing individual Hinglish words (e.g. mapping 'actually' to 'ak-chu-lee', 'kyun' to 'kyoon', and 'lekin' to 'lay-kin'). This pre-translation generates natural, correctly stressed Indian-English pronunciations with zero perceivable latency."
                },
                {
                    "q": "How did you build the offline-first sync mechanism in KRIYA using SQLite and AsyncStorage?",
                    "strategy": "Explain the React Native architecture. React Native JS thread -> SQLite storage. Explain the synchronization flow when internet is detected.",
                    "model": "KRIYA was designed as an offline-first productivity app. I used React Native + Expo. For data persistence, instead of making real-time API calls, the app writes all habit completion events, streaks, and user settings immediately into a local SQLite database using React Native's SQLite library. This ensures instant updates and zero UI lag. I also utilized AsyncStorage for rapid key-value caching (like user theme state and token credentials). For synchronization with our cloud DB (when connected), I wrote a sync middleware that captures a timestamp log of offline database modifications. When the net connects, the app syncs the delta changes back to our Supabase database in a background thread, resolving conflicts by using a 'last-write-wins' strategy."
                }
            ]
        },
        "3": {
            "name": "Core Technical & CS Fundamentals",
            "questions": [
                {
                    "q": "What is a JavaScript Closure? Give a practical real-world use case.",
                    "strategy": "Define closure (function bundled with its lexical environment). Practical use: data encapsulation (private variables), custom hooks creation, memoization, currying.",
                    "model": "A closure in JavaScript is a function that remembers and retains access to its outer (lexical) scope even after the outer function has finished executing. A practical, real-world use case is data privacy or state encapsulation. For example, if we want to create a counter function but prevent external code from directly modifying the count variable, we can return an inner function that increments a private variable declared inside the parent function. Another major React-specific application is within React hooks like `useState`, where React maintains access to the component's state across renders using closures."
                },
                {
                    "q": "How does Database Indexing work? What are B-Trees, and when does indexing slow down queries?",
                    "strategy": "Explain index structure (B-Trees / B+ Trees), fast lookup (O(log N)), when to index, and writing costs (INSERT, UPDATE, DELETE slow downs because index must be updated).",
                    "model": "Database indexing is a data structure technique used to quickly locate and retrieve data from a database table without scanning every single row. Under the hood, relational databases like PostgreSQL use B+ Trees (Balanced Trees) to store index keys. A B+ Tree organizes data in sorted nodes, allowing search, insertion, and deletion in O(log N) time complexity. While indexing speeds up read queries (`SELECT`) significantly, it actually slows down write queries (`INSERT`, `UPDATE`, `DELETE`) because the database engine must rebuild/rebalance the B+ Tree index nodes on every write. Therefore, we should index columns frequently used in `WHERE`, `JOIN`, or `ORDER BY` clauses, but avoid over-indexing tables with extremely high write frequencies."
                },
                {
                    "q": "Explain the difference between a Process and a Thread, and how Node.js manages concurrency with a single thread.",
                    "strategy": "Explain Process (isolated memory space, heavy) vs Thread (shares process memory, lightweight). Explain Node.js Event Loop, non-blocking I/O, and the libuv thread pool for CPU intensive tasks.",
                    "model": "A Process is an executing instance of a computer program with its own isolated memory space allocated by the OS. A Thread, however, is a lightweight subunit of execution inside a process that shares the parent process's memory space and resources. Node.js is single-threaded, meaning it executes JavaScript code in a single main thread. It achieves high concurrency using an Event Loop and non-blocking asynchronous I/O APIs. When an I/O operation (like a file read or database query) is requested, Node delegates the task to the underlying OS kernel or to its internal 'libuv' worker thread pool. The main thread continues executing JavaScript code. When the asynchronous task completes, it pushes a callback to the queue, which the Event Loop executes, allowing Node to handle thousands of concurrent connections on a single thread."
                }
            ]
        }
    }

# Display Practice Run Loop
def run_practice(category_id, questions_data):
    cat_name = questions_data["name"]
    q_list = questions_data["questions"]
    
    while True:
        clear_screen()
        print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
        print(f"{Style.HEADER}{Style.BOLD}   🎙️  PRACTICE ROOM: {cat_name.upper()}   {Style.ENDC}")
        print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
        
        for idx, q in enumerate(q_list):
            print(f"{Style.CYAN}{Style.BOLD}[{idx + 1}]{Style.ENDC} {q['q']}")
        print(f"\n{Style.WARNING}[M]{Style.ENDC} Main Menu")
        
        choice = input(f"\n{Style.BOLD}Choose a question to practice: {Style.ENDC}").strip()
        if choice.lower() == 'm':
            break
            
        if choice.isdigit() and 1 <= int(choice) <= len(q_list):
            q_selected = q_list[int(choice) - 1]
            conduct_interview_question(q_selected, cat_name)
        else:
            print(f"{Style.FAIL}Invalid input. Press [Enter] to try again...{Style.ENDC}")
            input()

# Conduct the actual question mock sequence - NOW DESIGNED WITH PAGINATION & TEXT WRAPPING
def conduct_interview_question(q, category):
    # --- PAGE 1: QUESTION DISPLAY ---
    clear_screen()
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}              🎙️  V.A.N.I. ACTIVE INTERVIEW SIMULATOR 🎙️                 {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    print(f"{Style.BOLD}TRACK:{Style.ENDC} {category}\n")
    print(f"{Style.BOLD}QUESTION:{Style.ENDC}")
    print_wrapped(q['q'], Style.CYAN + Style.BOLD)
    print("\n" + "-"*73 + "\n")
    input(f"{Style.BOLD}{Style.BLUE}Press [Enter] to view the STRATEGY CORNER...{Style.ENDC}")
    
    # --- PAGE 2: STRATEGY CORNER ---
    clear_screen()
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}                        💡 STRATEGY CORNER                               {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    print(f"{Style.BOLD}QUESTION:{Style.ENDC}")
    print_wrapped(q['q'], Style.CYAN)
    print("\n" + "-"*73 + "\n")
    print(f"{Style.BOLD}{Style.WARNING}STRATEGIC PITCH CRITERIA:{Style.ENDC}\n")
    print_wrapped(q['strategy'], Style.WARNING)
    print("\n" + "-"*73 + "\n")
    input(f"{Style.BOLD}{Style.BLUE}Press [Enter] to view the ELITE MODEL ANSWER...{Style.ENDC}")
    
    # --- PAGE 3: ELITE MODEL ANSWER ---
    clear_screen()
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}                  🌟 ELITE MODEL ANSWER                                  {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    print(f"{Style.BOLD}QUESTION:{Style.ENDC}")
    print_wrapped(q['q'], Style.CYAN)
    print("\n" + "-"*73 + "\n")
    print(f"{Style.BOLD}{Style.GREEN}MODEL PITCH (Pitching Your BCA & Projects):{Style.ENDC}\n")
    print_wrapped(q['model'], Style.GREEN + Style.BOLD)
    print("\n" + "-"*73 + "\n")
    print(f"{Style.BOLD}📋 PREPARATION ACTION:{Style.ENDC}")
    print("1. Speak ALOUD! Explain it out loud to practice your actual vocal delivery.")
    print("2. When ready, press [Enter] to start your speaking timer.")
    input(f"\n{Style.BOLD}{Style.BLUE}Press [Enter] to start your speaking practice timer...{Style.ENDC}")
    
    # --- PAGE 4: ACTIVE TIMED SPEAKING BLOCK ---
    clear_screen()
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}                    🔴 NOW SPEAKING - PRACTICE IN PROGRESS                {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    print(f"QUESTION:")
    print_wrapped(q['q'], Style.CYAN + Style.BOLD)
    print("\n" + "-"*73 + "\n")
    print("🔥 Tip: Apply V.A.N.I. (Steady speed, pause, use technical vocabulary, STAR format).\n")
    
    start_time = time.time()
    try:
        print(f"{Style.BOLD}{Style.WARNING}Press [Ctrl+C] or enter anything to STOP the timer when finished!{Style.ENDC}\n")
        sys.stdout.write("⏱️  Time Elapsed: 00:00")
        sys.stdout.flush()
        
        while True:
            time.sleep(1)
            elapsed = int(time.time() - start_time)
            mins = elapsed // 60
            secs = elapsed % 60
            sys.stdout.write(f"\r⏱️  Time Elapsed: {mins:02d}:{secs:02d}")
            sys.stdout.flush()
    except (KeyboardInterrupt, Exception):
        # Graceful exit of loop
        pass
        
    duration = int(time.time() - start_time)
    print(f"\n\n{Style.GREEN}✔ Practice stopped!{Style.ENDC} Total Speaking Time: {Style.BOLD}{duration//60}m {duration%60}s{Style.ENDC}")
    
    # Self-Evaluation Checklist
    print(f"\n{Style.BOLD}🔍 V.A.N.I. SELF-EVALUATION CHECKLIST:{Style.ENDC}")
    print("1. Did I speak at a steady pace without rushing? (V)")
    print("2. Did I avoid filler words (um, like, basically)? (V)")
    print("3. Did I structure my project answer using STAR? (N)")
    print("4. Did I use high-impact technical terms? (V)")
    
    rating = ""
    while not rating.isdigit() or not (1 <= int(rating) <= 5):
        rating = input(f"\n{Style.BOLD}Rate your performance (1-5 stars, where 5 is flawless): {Style.ENDC}").strip()
        
    notes = input(f"{Style.BOLD}Any quick notes on what you can improve next time? {Style.ENDC}").strip()
    
    save_practice_log(q['q'], category, duration, int(rating), notes)
    
    print(f"\n{Style.GREEN}✔ Practice recorded successfully in coach_history.json!{Style.ENDC}")
    print("Press [Enter] to return...")
    input()

# Main Menu
def main_menu():
    questions = get_questions()
    
    while True:
        clear_screen()
        print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
        print(f"{Style.HEADER}{Style.BOLD}             🎙️  WELCOME TO V.A.N.I. INTERVIEW COACH CLI 🎙️             {Style.ENDC}")
        print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
        print(f"      Built specifically for {Style.BOLD}Jayesh Kumar{Style.ENDC} to crack 10+ LPA Tech Interviews.\n")
        
        print(f"{Style.BOLD}SELECT A PRACTICE TRACK:{Style.ENDC}")
        for key, category in questions.items():
            print(f"   {Style.CYAN}{Style.BOLD}[{key}]{Style.ENDC} {category['name']}")
            
        print(f"   {Style.CYAN}{Style.BOLD}[F]{Style.ENDC} Read V.A.N.I. Speaking Framework Details")
        print(f"   {Style.CYAN}{Style.BOLD}[H]{Style.ENDC} View My Practice History Stats")
        print(f"   {Style.FAIL}{Style.BOLD}[Q]{Style.ENDC} Quit Coach")
        
        choice = input(f"\n{Style.BOLD}Enter choice: {Style.ENDC}").strip().upper()
        
        if choice == 'Q':
            print(f"\n{Style.BOLD}{Style.GREEN}Keep speaking confidently, Jayesh. You will crack it! Day and night, let's keep working. Goodbye!{Style.ENDC}\n")
            break
        elif choice == 'F':
            print_framework()
        elif choice == 'H':
            show_history()
        elif choice in questions:
            run_practice(choice, questions[choice])
        else:
            print(f"{Style.FAIL}Invalid input. Press [Enter] to try again...{Style.ENDC}")
            input()

# Show local history stats
def show_history():
    clear_screen()
    log_file = os.path.join(os.path.dirname(__file__), 'coach_history.json')
    
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}                     📈 MY PRACTICE PROGRESS HISTORY                     {Style.ENDC}")
    print(f"{Style.HEADER}{Style.BOLD}========================================================================={Style.ENDC}\n")
    
    if not os.path.exists(log_file):
        print("No practice logs found yet. Choose a question and start speaking aloud!")
    else:
        try:
            with open(log_file, 'r') as f:
                logs = json.load(f)
                
            print(f"Total Questions Practiced: {Style.BOLD}{len(logs)}{Style.ENDC}\n")
            print(f"{Style.BOLD}{'Date & Time':<20} | {'Category':<25} | {'Rating':<6} | {'Duration':<8}{Style.ENDC}")
            print("-" * 73)
            
            ratings = []
            for entry in logs[-15:]: # Show last 15 attempts
                rating_stars = "★" * entry['self_rating'] + "☆" * (5 - entry['self_rating'])
                dur_str = f"{entry['duration_seconds']//60}m {entry['duration_seconds']%60}s"
                cat_truncated = entry['category'][:23] + "..." if len(entry['category']) > 23 else entry['category']
                print(f"{entry['timestamp'][:16]:<20} | {cat_truncated:<25} | {rating_stars:<6} | {dur_str:<8}")
                ratings.append(entry['self_rating'])
            
            if ratings:
                avg_rating = sum(ratings) / len(ratings)
                print("-" * 73)
                print(f"Recent Average Self-Rating: {Style.BOLD}{Style.GREEN}{avg_rating:.2f} / 5.00{Style.ENDC}")
                
        except Exception as e:
            print(f"Error loading practice logs: {e}")
            
    print("\nPress [Enter] to return to the Main Menu...")
    input()

if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print(f"\n\n{Style.BOLD}{Style.GREEN}Keep speaking confidently, Jayesh! Goodbye!{Style.ENDC}\n")

import os

readme_content = """# Okos 🧠

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-1.0.0--alpha-blue)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)

**Okos** (Hungarian for *Smart*) is an autonomous project management engine that bridges the gap between high-level ideation and technical execution. 

Unlike traditional project management tools that act as static databases, **Okos** leverages Large Language Models (LLMs) to transform natural language input into structured tickets, and then uses AI agents to execute the tasks within your development environment.

## ✨ Key Features

- **Natural Language Ingestion:** Describe a feature or a bug in plain English; Okos handles the decomposition.
- **AI Ticket Generation:** Automatically creates detailed technical tickets with acceptance criteria, labels, and priority levels.
- **Autonomous Execution:** Integrated AI agents can write code, run scripts, or update documentation based on ticket requirements.

## 🚀 How It Works

1. **Input:** You provide a prompt: *"Add a dark mode toggle to the dashboard."*
2. **Analysis:** Okos breaks this down into sub-tasks (UI changes, state management, CSS variables).
3. **Drafting:** Tickets are generated automatically using Gemini Flash
4. **Action:** The Okos Agent checks out a new branch, writes the code, and opens a PR for review.

## 🛠 Installation

```bash
# Clone the repository
git clone [https://github.com/yourusername/okos.git](https://github.com/yourusername/okos.git)

# Navigate to the directory
cd okos

# Install dependencies
npm install  # or pip install -r requirements.txt

# Configure your environment
cp .env.example .env

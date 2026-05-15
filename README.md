# LifeNest

LifeNest is a secure personal life management platform developed as a software engineering capstone project. It integrates tasks, notes, study planning, budgeting, expenses, and a Today-focused dashboard into one modular web application.

## Project Overview

Many users manage their daily life using fragmented tools: one app for tasks, another for notes, another for budgeting, and sometimes a separate system for study planning. LifeNest reduces this fragmentation by combining the most essential personal planning workflows into one focused platform.

The project was developed as an academic MVP with emphasis on security, modular architecture, usability, and practical daily-life organization.

## Core Features

- User authentication and protected sessions
- Personal and study task management
- Task notes and contextual information
- Today-focused dashboard
- Monthly budget tracking
- Expense management
- Automatic expense creation from completed paid tasks
- Basic reports and summary views
- Secure modular API endpoints

## Technology Stack

- Backend: PHP
- Database: MySQL
- Frontend: HTML, CSS, JavaScript
- Architecture: Modular PHP pages with JSON API endpoints
- Methodology: Agile / Scrum-inspired incremental development

## Security Features

LifeNest was developed with a security-focused approach, including:

- CSRF protection for state-changing requests
- Ownership-based authorization using `user_id`
- Prepared statements for database operations
- Input validation
- Output escaping
- Secure session handling
- Content Security Policy compliance
- Security headers across protected pages

## Main Modules

### Tasks

Create and manage personal or study-related tasks with priority, duration, status, due dates, and optional expected cost.

### Notes

Attach contextual notes to tasks and review them through a unified notes view.

### Study Planning

Organize study-related tasks and academic planning workflows.

### Budget and Expenses

Define a monthly budget, add expenses, and track remaining balance.

### Dashboard

View daily priorities, task summaries, schedule awareness, and budget status in one place.

## Architecture

LifeNest follows a layered modular architecture:

1. Client Layer
2. Presentation Layer
3. API Layer
4. Security Layer
5. Service / Business Logic Layer
6. Database Layer

This structure improves maintainability, separation of concerns, and security control.

## Project Status

Academic MVP completed.

## Testing and Evaluation

The project includes:

- Functional testing
- Integration testing
- Scenario-based testing
- Security-oriented validation
- Pilot usability feedback from representative users

## Repository Purpose

This repository contains the source code and project artifacts for the LifeNest graduation project.

## Important Notes

Sensitive configuration files, credentials, database passwords, and private environment files should not be committed to this repository.

## License

Academic use only.

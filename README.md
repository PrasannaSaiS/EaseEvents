# EaseEvents — Real-Time Crowd Intelligence System

> Transforming large-scale event experiences with intelligent, real-time crowd orchestration.


## Overview

EaseEvents is an AI-powered system designed to **optimize crowd movement, reduce waiting times, and enable real-time coordination** in large-scale sporting venues.

Unlike traditional monitoring systems, EaseEvents introduces a **proactive, decision-driven approach** — where natural language commands are converted into intelligent, actionable insights that dynamically guide crowd flow across the venue.


## Problem Statement

Managing crowd dynamics in stadiums and large venues is highly complex:

- Congestion at entry/exit gates  
- Long wait times at food courts and facilities  
- Lack of real-time coordination  
- Reactive (not predictive) crowd management  

These challenges directly impact **safety, efficiency, and user experience**.


## Our Solution

EaseEvents provides a **real-time crowd intelligence layer** that:

- Interprets natural language commands  
- Detects crowd conditions and intent  
- Generates optimized routing decisions  
- Updates a live dashboard instantly  


## Key Features

### AI Command Processing
- Accepts human-like commands:

"South Gate crowded redirect to North Gate"


- Converts them into structured decisions using a hybrid AI engine


### Real-Time Crowd Intelligence
- Zone-based analysis (Gates, Food Courts, etc.)
- Dynamic crowd level detection (Low / Medium / High)
- Wait-time estimation


### Smart Routing Engine
- Suggests optimal movement paths
- Reduces congestion through intelligent redistribution


### Live Alerts System
- Generates real-time alerts:
- “Avoid South Gate”
- “Food Court B is clear”
- Prioritized by severity


### Explainable AI Decisions
Every output includes:
- Confidence score  
- Reasoning explanation  

Example:
son
{
"crowd": "High",
"waitTime": 19,
"route": "North Gate",
"alert": "Avoid South Gate",
"confidence": 0.95,
"reasoning": "High congestion detected at South Gate. Rerouting crowd to North Gate to balance distribution."
}



### Live Dashboard (AppSheet UI)

* Real-time stadium status
* Visual crowd indicators (🔴 🟡 🟢)
* Auto-updating alerts feed


## System Architecture

AppSheet UI (User / Admin)
        ↓
Webhook Trigger (Automation Bot)
        ↓
Cloud Run Backend (Node.js API)
        ↓
AI Decision Engine
        ↓
Google Sheets (Live Data Layer)
        ↓
AppSheet Dashboard Update


## Core Components

### Backend (Cloud Run)

* Built with **Node.js + Express**
* Handles API requests and AI processing
* Deployed serverlessly on Google Cloud Run


### AI Decision Engine (Hybrid Approach)

Instead of purely rule-based logic, EaseEvents uses:

1. **Rule-based Layer**

   * Ensures reliability and deterministic outputs

2. **Heuristic Layer**

   * Enhances decisions using context (crowd intensity, intent clarity)

3. **Explainability Layer**

   * Generates reasoning + confidence scores

This makes the system:

> Reliable
> Interpretable
> Extensible to full LLM integration


### Data Layer (Google Sheets)

Acts as a **real-time system database**:

* `venue_status` → live crowd state
* `alerts_feed` → alert stream
* `command_logs` → AI history


### Frontend (AppSheet)

* No-code UI layer
* Provides:

  * Live dashboard
  * Alerts feed
  * AI command panel


## API Specification

### POST `/process-command`

#### Input:

{
  "command": "South Gate crowded redirect to North Gate"
}


#### Output:

{
  "success": true,
  "result": {
    "crowd": "High",
    "waitTime": 19,
    "route": "North Gate",
    "alert": "Avoid South Gate",
    "confidence": 0.95,
    "reasoning": "High congestion detected..."
  }
}


## Deployment

* **Backend**: Google Cloud Run
* **API**: Public endpoint (serverless)
* **UI**: AppSheet (connected to Google Sheets)



## Demo Flow

1. Admin enters command:


   "South Gate crowded redirect to North Gate"


2. System processes command via API

3. AI engine generates decision

4. Google Sheets updated instantly

5. AppSheet dashboard reflects:

   *  High crowd at South Gate
   * Suggested route: North Gate
   * Alert generated



## Innovation & Differentiation

### What Makes EaseEvents Unique?

* ✅ **Natural Language Control System**
* ✅ **Real-Time Decision Engine (Not Static Monitoring)**
* ✅ **Explainable AI Outputs (Confidence + Reasoning)**
* ✅ **Hybrid AI Architecture (Rules + Intelligence)**
* ✅ **Low-Code + Cloud Integration for Rapid Deployment**


## Future Enhancements

* Predictive crowd flow using historical data
* LLM-based command understanding (Gemini / GPT)
* IoT / sensor integration
* Heatmap visualization
* Mobile user navigation assistant


## Tech Stack

* **Backend**: Node.js, Express
* **Cloud**: Google Cloud Run
* **Data**: Google Sheets API
* **Frontend**: AppSheet
* **Automation**: AppSheet Bots (Webhook)


## Impact

EaseEvents transforms event management from:


Reactive Monitoring 
        ↓
Proactive AI Coordination 


It enhances:

* Crowd safety
* Operational efficiency
* Attendee experience


## Author

Built as part of a top-tier hackathon challenge focused on improving physical event experiences using AI and cloud technologies.

## Conclusion

EaseEvents is not just a project — it’s a **scalable foundation for intelligent event management systems**, demonstrating how AI can bridge the gap between digital intelligence and real-world environments.


“From chaos to coordination - powered by AI.”

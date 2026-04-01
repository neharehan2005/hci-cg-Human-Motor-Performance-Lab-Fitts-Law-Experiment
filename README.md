# 🎯 Target Rush: Fitts’ Law Experiment

An interactive Human-Computer Interaction (HCI) experiment designed to **measure human motor performance** in a mouse-based target selection task.

This project models the complete cognitive workflow:
- 👁️ **Perception**
- 🧠 **Decision**
- 🎯 **Motor Execution**

---

## 📖 Objective

To measure **human motor performance** using a controlled pointing task based on **Fitts’ Law**, while incorporating perception and decision-making elements to simulate real-world interaction complexity.

---

## 🧠 HCI Model Implementation

This experiment is designed according to three core stages:

### 👁️ Perception
- Users must **identify the correct target**
- The target may include visual cues (e.g., shaking/animation)
- **Distractors (ghosts)** introduce visual noise
- Users must ignore irrelevant stimuli

---

### 🧠 Decision
- Targets are placed along **diagonal paths**
- Users must **decide the correct movement direction**
- Adds a cognitive layer beyond simple clicking

---

### 🎯 Motor Execution
- Users move the cursor and click the target
- Performance is measured in terms of:
  - Movement Time (MT)
  - Accuracy (misses)
  - Throughput (bps)

---

## 📐 Fitts’ Law

This experiment follows:

MT = a + b × ID  

Where:
- **MT** → Movement Time (ms)
- **ID** → Index of Difficulty  
- **a** → Intercept (reaction/initiation time)
- **b** → Slope (movement efficiency)

### Index of Difficulty:

ID = log₂(D / W + 1)

- **D** → Distance to target  
- **W** → Width of target  

---

## 🚀 Features

- 🎮 Interactive game-like UI (Cyber / Mario / Space themes)
- 🎯 Controlled target placement at fixed distances
- 👻 Visual distractors (ghost targets) *(Perception modeling)*
- ↗️ Diagonal target positioning *(Decision modeling)*
- ⚡ Smooth player animation with trails
- 💥 Hit feedback (explosions)
- ❌ Miss detection system
- 📊 Real-time statistics dashboard:
  - Average MT
  - Last MT
  - Condition progress
- 📈 Automatic calculation of:
  - Fitts’ Law parameters (a, b)
  - Throughput (bps)
- 📥 CSV export for experimental data

---

## 🧪 Experiment Design

- **3 Conditions**
  - D = 200, 320, 480 px
  - W = 80 px
- **8 trials per condition**
- Total: **24 trials**

Targets are placed using controlled geometry to maintain consistent **Index of Difficulty (ID)**.

---

## 📊 Data Collection

Each trial records:

- Trial index  
- Condition (D, W, ID)  
- Movement Time (MT)  
- Hit / Miss count  
- Throughput  
- Timestamp  

CSV export includes:
- All raw trial data
- Fitts’ model parameters (a, b)
- Mean throughput

---

## 🎮 How to Use

1. Click **Start**
2. Identify the correct target (ignore distractors)
3. Decide movement direction (diagonal placement)
4. Move cursor and click target
5. Complete all trials
6. Download results as CSV

---

## 🛠️ Tech Stack

- React (Hooks)
- JavaScript (ES6)
- HTML5 Canvas (particle effects)
- CSS animations

---

## ▶️ Run Locally

```bash
npm install
npm run dev
<img width="829" height="492" alt="image" src="https://github.com/user-attachments/assets/9f942081-59d9-4d65-9201-d157985374e1" />


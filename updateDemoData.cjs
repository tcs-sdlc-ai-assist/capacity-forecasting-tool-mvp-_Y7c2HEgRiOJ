const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'src/data/sampleDataset.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const teamsToAdd = [
  "Investment",
  "Data Mastery",
  "ITIOPS",
  "ITMID",
  "OPS",
  "OTCP",
  "ACE",
  "Portfolio Construction",
  "Portfolio Research",
  "Product Master",
  "Project Phoenix",
  "RDS",
  "Security Master",
  "z-InvOps"
];

// Add random dates
const statuses = ["Lights On", "Tech Debt", "Strategic", "Implementing", "Backlog", "Analyzing", "Reviewing", "QA"];

data.workItems.forEach((item, index) => {
  // Add random allocations
  const numTeams = Math.floor(Math.random() * 3) + 1; // 1 to 3 teams
  for (let i = 0; i < numTeams; i++) {
    const randomTeam = teamsToAdd[Math.floor(Math.random() * teamsToAdd.length)];
    if (!item.team) item.team = [];
    if (!item.team.includes(randomTeam)) {
      item.team.push(randomTeam);
    }
    if (!item.allocations) item.allocations = {};
    if (!item.allocations[randomTeam]) {
      item.allocations[randomTeam] = Math.floor(Math.random() * 20) + 1;
    }
  }
  
  // Add random dates
  const startDay = Math.floor(Math.random() * 28) + 1;
  const startMonth = Math.floor(Math.random() * 6) + 1;
  const startDate = `2026-${startMonth.toString().padStart(2, '0')}-${startDay.toString().padStart(2, '0')}`;
  
  const endDay = Math.floor(Math.random() * 28) + 1;
  const endMonth = startMonth + Math.floor(Math.random() * 6) + 1;
  const endDate = `2026-${endMonth.toString().padStart(2, '0')}-${endDay.toString().padStart(2, '0')}`;

  item.startDate = startDate;
  item.endDate = endDate;
  
  if (!item.status) {
    item.status = statuses[Math.floor(Math.random() * statuses.length)];
  }
});

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

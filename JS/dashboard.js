const GRAPHQL_URL = "https://learn.reboot01.com/api/graphql-engine/v1/graphql";

// get html elements
const logoutButton = document.getElementById("logoutButton");
const userIdSpan = document.getElementById("user-id");
const userLoginSpan = document.getElementById("user-login");
const userCohortSpan = document.getElementById("user-cohort");
const currentProjectSpan = document.getElementById("current-project");
const xpProgressChart = document.getElementById("xp-progress-chart");
const auditRatioSpan = document.getElementById("audit-ratio");
const auditUpText = document.getElementById("audit-up-text");
const auditDownText = document.getElementById("audit-down-text");
const auditRatioChart = document.getElementById("audit-ratio-chart");
const projectsPassedSpan = document.getElementById("projects-passed");
const projectsFailedSpan = document.getElementById("projects-failed");
const projectStatusChart = document.getElementById("project-status-chart");
const totalXpSpan = document.getElementById("total-xp");
const recentProjectsList = document.getElementById("recent-projects-list");
const totalXpTile = document.querySelector(".tile-total-xp");
const xpAvatar = document.getElementById("xp-avatar");
const clickSound = document.getElementById("click-sound");


let jwtToken = null;

// check if there is token when page loads
window.addEventListener("load", () => {
  const savedToken = localStorage.getItem("jwt");

  if (!savedToken) {
    localStorage.setItem(
      "errorMessage",
      "Your session token is missing or expired. Please log in again."
    );
    window.location.href = "error.html";
    return;
  }

  jwtToken = savedToken;
  loadProfileData();
});

// logout button
logoutButton.addEventListener("click", () => {
  if (clickSound) {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => { });
  }

  setTimeout(() => {
    localStorage.removeItem("jwt");
    window.location.href = "auth.html";
  }, 150);
});


async function graphqlRequest(query) {
  if (!jwtToken) {
    localStorage.setItem("errorMessage", "Missing authentication token.");
    window.location.href = "error.html";
    return;
  }

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      localStorage.setItem(
        "errorMessage",
        "GraphQL request failed with status " + response.status
      );
      window.location.href = "error.html";
      return;
    }

    const result = await response.json();

    if (result.errors) {
      console.error(result.errors);
      localStorage.setItem(
        "errorMessage",
        "GraphQL returned errors. Check console for details."
      );
      window.location.href = "error.html";
      return;
    }

    return result.data;
  } catch (err) {
    console.error(err);
    localStorage.setItem(
      "errorMessage",
      "Network error while talking to GraphQL: " + err.message
    );
    window.location.href = "error.html";
  }
}

async function loadProfileData() {
  try {
    const userQuery = `
      {
        user {
          id
          login
          attrs
          labels {
            labelName
          }
          progresses(order_by: { createdAt: asc }) {
            grade
            createdAt
            object {
              name
              type
            }
          }
        }
      }
      `;



    const data = await graphqlRequest(userQuery);

    if (!data || !data.user || data.user.length === 0) {
      localStorage.setItem("errorMessage", "Could not load user information.");
      window.location.href = "error.html";
      return;
    }

    const user = data.user[0];

    const gender =
      user.attrs && user.attrs.genders
        ? String(user.attrs.genders).toLowerCase()
        : null;

    if (totalXpTile && xpAvatar) {
      if (gender === "female") {
        totalXpTile.style.background =
          "linear-gradient(135deg, #ff89d2, #ffd9eb)";
        xpAvatar.src = "../imgs/minecraftFemaleClear.png";
        xpAvatar.alt = "Minecraft female avatar";
      } else if (gender === "male") {
        totalXpTile.style.background =
          "linear-gradient(135deg, #daff66, #ffffc4)";
        xpAvatar.src = "../imgs/minecraftMaleClear.png";
        xpAvatar.alt = "Minecraft male avatar";
      } else {
        // neutral fallback
        totalXpTile.style.background =
          "linear-gradient(135deg, #ffd37a, #fff0c2)";
        xpAvatar.src = "imgs/minecraftFemaleClear.png";
        xpAvatar.alt = "Minecraft avatar";
      }
    }


    userIdSpan.textContent = user.id;
    userLoginSpan.textContent = user.login;

    let cohortName = "Unknown";
    if (user.labels && user.labels.length > 0) {
      cohortName = user.labels[0].labelName;
    }
    userCohortSpan.textContent = cohortName;

    let currentProjectName = "None";

    if (user.progresses && user.progresses.length > 0) {
      const projectProgresses = user.progresses.filter(
        (p) => p.object && p.object.type === "project"
      );

      let latestOpen = null;
      projectProgresses.forEach((p) => {
        if (p.grade === null) {
          if (!latestOpen || new Date(p.createdAt) > new Date(latestOpen.createdAt)) {
            latestOpen = p;
          }
        }
      });

      if (latestOpen && latestOpen.object) {
        currentProjectName = latestOpen.object.name || "Unknown project";
      }
    }

    currentProjectSpan.textContent = currentProjectName;


    const xpEvents = await loadXpProgression(user.id);
    console.log("XP EVENTS:", xpEvents);

    const boardEvents = xpEvents.filter(isBoardXp);

    drawXpProgressChart(boardEvents);
    updateXpSection(boardEvents, currentProjectName);

    await loadAuditRatio();
    await loadProjectStatus();
  } catch (err) {
    console.error(err);
    localStorage.setItem(
      "errorMessage",
      "Error while loading profile data: " + err.message
    );
    window.location.href = "error.html";
  }
}

function formatXp(amount) {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 1000) {
    let value = (abs / 1000).toFixed(1);
    if (value.endsWith(".0")) value = value.slice(0, -2);
    return `${sign}${value}kB`;
  } else {
    return `${sign}${abs}B`;
  }
}

function formatTotalXp(amount) {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 1000) {
    let value = Math.round(abs / 1000);
    return `${sign}${value}kB`;
  } else {
    return `${sign}${abs}B`;
  }
}


async function loadXpProgression(userId) {
  const xpQuery = `
  {
    transaction(
      where: {
        userId: { _eq: ${userId} }
        type: { _eq: "xp" }
      }
      order_by: { createdAt: asc }
      limit: 1000
    ) {
      amount
      createdAt
      path
      originEventId
    }
  }
  `;

  const data = await graphqlRequest(xpQuery);
  if (!data || !data.transaction) {
    console.error("No XP data found");
    return [];
  }
  return data.transaction;
}

function isBoardXp(ev) {
  if (!ev || !ev.path) return false;
  const path = ev.path.toLowerCase();

  if (ev.originEventId === 250 && path.startsWith("/bahrain/bh-module/")) {
    return true;
  }

  if (
    ev.originEventId === 874 &&
    path === "/bahrain/bh-module/piscine-js"
  ) {
    return true;
  }

  if (
    (ev.originEventId === 485 || ev.originEventId === 497) &&
    path.startsWith("/bahrain/bh-module/checkpoint/")
  ) {
    return true;
  }

  return false;
}


function updateXpSection(boardEvents, currentProjectName) {
  if (!totalXpSpan || !recentProjectsList) return;

  if (!boardEvents || boardEvents.length === 0) {
    totalXpSpan.textContent = "0kB";
    recentProjectsList.innerHTML = "<div>No XP yet.</div>";
    return;
  }

  // total XP
  let totalBytes = 0;
  boardEvents.forEach((ev) => {
    if (typeof ev.amount === "number") {
      totalBytes += ev.amount;
    }
  });
  totalXpSpan.textContent = formatTotalXp(totalBytes);

  const rows = [];

  let currentHasXp = false;
  if (currentProjectName && currentProjectName !== "None") {
    const currentLower = currentProjectName.toLowerCase();
    currentHasXp = boardEvents.some((ev) => {
      if (!ev.path) return false;
      const parts = ev.path.split("/");
      const name = parts[parts.length - 1] || "";
      return name.toLowerCase() === currentLower;
    });
  }

  if (
    currentProjectName &&
    currentProjectName !== "None" &&
    !currentHasXp
  ) {
    rows.push({
      name: `${currentProjectName} – In progress`,
      xp: "",
      inProgress: true,
    });
  }

  const projectMap = new Map();

  boardEvents.forEach((ev) => {
    if (!ev.path) return;

    const parts = ev.path.split("/");
    const name = parts[parts.length - 1] || "unknown";
    const key = name.toLowerCase();

    const existing = projectMap.get(key);

    if (!existing || new Date(ev.createdAt) > new Date(existing.createdAt)) {
      projectMap.set(key, { name, ev });
    }
  });

  const latestPerProject = Array.from(projectMap.values()).sort(
    (a, b) => new Date(b.ev.createdAt) - new Date(a.ev.createdAt)
  );

  latestPerProject.forEach((item) => {
    rows.push({
      name: item.name,
      xp: formatXp(item.ev.amount),
      inProgress: false,
    });
  });

  renderRecentProjects(rows);
}




function renderRecentProjects(projects) {
  const container = document.getElementById("recent-projects-list");
  container.innerHTML = "";

  projects.forEach((p) => {
    const row = document.createElement("div");
    row.className = "recent-project-row";

    if (p.inProgress) {
      row.classList.add("in-progress");
    }

    row.innerHTML = `
      <div class="project-name">${p.name}</div>
      <div class="project-xp">${p.xp ? p.xp + " XP" : ""}</div>
    `;

    container.appendChild(row);
  });
}




function drawXpProgressChart(boardEvents) {
  xpProgressChart.innerHTML = "";
  if (!boardEvents || boardEvents.length === 0) return;

  let cumulative = 0;
  const points = boardEvents.map((event, index) => {
    cumulative += event.amount;
    return {
      index,
      xp: cumulative,
      event
    };
  });

  const width = xpProgressChart.clientWidth || 600;
  const height = xpProgressChart.clientHeight || 220;

  const paddingLeft = 30;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 26;

  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  const maxXp = Math.max(...points.map((p) => p.xp)) || 1;
  const minXp = Math.min(...points.map((p) => p.xp)) || 0;
  const xpRange = maxXp - minXp || 1;

  const stepX =
    points.length > 1 ? usableWidth / (points.length - 1) : usableWidth;

  const svgNS = "http://www.w3.org/2000/svg";

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", 0);
  bg.setAttribute("y", 0);
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "rgba(0,0,0,0.65)");
  xpProgressChart.appendChild(bg);

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = paddingTop + (usableHeight / gridLines) * i;
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", paddingLeft);
    line.setAttribute("y1", y);
    line.setAttribute("x2", width - paddingRight);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "rgba(255,255,255,0.12)");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("shape-rendering", "crispEdges");
    xpProgressChart.appendChild(line);
  }

  const pixelPoints = [];
  const pointCoords = [];

  points.forEach((p, i) => {
    const baseX = paddingLeft + i * stepX;
    const norm = (p.xp - minXp) / xpRange;
    const baseY = paddingTop + (1 - norm) * usableHeight;

    const x = Math.round(baseX);
    const y = Math.round(baseY);

    pointCoords.push({ x, y, data: p });

    if (i === 0) {
      pixelPoints.push({ x, y });
    } else {
      const prev = pixelPoints[pixelPoints.length - 1];

      pixelPoints.push({ x, y: prev.y });

      pixelPoints.push({ x, y });
    }
  });

  const polyPoints = pixelPoints
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  const polyline = document.createElementNS(svgNS, "polyline");
  polyline.setAttribute("points", polyPoints);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#b4ff3f");
  polyline.setAttribute("stroke-width", "2");
  polyline.setAttribute("shape-rendering", "crispEdges");
  polyline.setAttribute("stroke-linejoin", "miter");
  polyline.setAttribute("stroke-linecap", "butt");
  xpProgressChart.appendChild(polyline);

  let tooltip = document.getElementById("xp-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "xp-tooltip";
    tooltip.className = "xp-tooltip";
    document.body.appendChild(tooltip);
  }
  tooltip.style.opacity = "0";
  tooltip.dataset.active = "false";

  function fillTooltip(point) {
    const ev = point.data.event;
    const date = new Date(ev.createdAt);
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const gained = formatXp(ev.amount);
    let projectName = "unknown";
    if (ev.path) {
      const parts = ev.path.split("/");
      projectName = parts[parts.length - 1] || projectName;
    }

    tooltip.innerHTML = `
      <div class="xp-tooltip-date">${formattedDate}</div>
      <div class="xp-tooltip-row">
        <span class="xp-tooltip-label">XP GAINED</span>
        <span class="xp-tooltip-xp">${gained}</span>
      </div>
      <div class="xp-tooltip-project">${projectName}</div>
    `;
  }

  function hideTooltip() {
    tooltip.style.opacity = "0";
    tooltip.dataset.active = "false";
  }

  xpProgressChart.addEventListener("pointerdown", (e) => {
    if (!(e.target instanceof SVGCircleElement)) {
      hideTooltip();
    }
  });


  pointCoords.forEach((point) => {
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 4);
    circle.setAttribute("fill", "#f9fafb");
    circle.setAttribute("stroke", "#b4ff3f");
    circle.setAttribute("stroke-width", "2");
    circle.style.cursor = "pointer";

    circle.setAttribute("fill-opacity", "0");
    circle.setAttribute("stroke-opacity", "0");

    circle.addEventListener("pointerenter", () => {
      fillTooltip(point);
      tooltip.style.opacity = "1";
      tooltip.dataset.active = "true";

      circle.setAttribute("fill-opacity", "1");
      circle.setAttribute("stroke-opacity", "1");
      circle.setAttribute("fill", "#b4ff3f");
      circle.setAttribute("stroke", "#ffffff");
    });

    circle.addEventListener("pointerleave", () => {
      hideTooltip();
      circle.setAttribute("fill-opacity", "0");
      circle.setAttribute("stroke-opacity", "0");
      circle.setAttribute("fill", "#f9fafb");
      circle.setAttribute("stroke", "#b4ff3f");
    });

    circle.addEventListener("pointermove", (e) => {
      if (tooltip.dataset.active !== "true") return;

      const offsetX = 16;
      const offsetY = 18;
      const margin = 10;

      let left = e.clientX + offsetX;
      let top = e.clientY - offsetY;

      const rect = tooltip.getBoundingClientRect();

      if (left + rect.width > window.innerWidth - margin) {
        left = e.clientX - rect.width - offsetX;
      }
      if (left < margin) left = margin;

      if (top + rect.height > window.innerHeight - margin) {
        top = window.innerHeight - margin - rect.height;
      }
      if (top < margin) top = margin;

      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    });

    circle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    xpProgressChart.appendChild(circle);
  });


}


async function loadAuditRatio() {
  const query = `
    {
      user {
        auditRatio
        totalUp
        totalDown
      }
    }
  `;

  const data = await graphqlRequest(query);
  const user = data.user[0];

  const ratio = user.auditRatio;
  const totalUp = user.totalUp;
  const totalDown = user.totalDown;

  // Draw the XP bar first
  drawAuditRatioBar(totalUp, totalDown, ratio);

  // Then place Done / Received text UNDER the SVG bar
  const upK = (totalUp / 1000).toFixed(1);
  const downK = (totalDown / 1000).toFixed(1);

  auditUpText.textContent = `• ${upK}k Done`;
  auditDownText.textContent = `• ${downK}k Received`;
}





function drawAuditRatioBar(totalUp, totalDown, ratioValue) {
  auditRatioChart.innerHTML = "";

  const width = auditRatioChart.clientWidth || 500;
  const height = auditRatioChart.clientHeight || 110; // more vertical space

  const SCALE = 2.2;

  const pixelBarWidth = 182;
  const pixelBarHeight = 5;
  const barWidth = pixelBarWidth * SCALE;
  const barHeight = pixelBarHeight * SCALE;

  // move the bar slightly lower so the number fits above it
  const barX = (width - barWidth) / 2;
  const barY = height * 0.55;


  const total = totalUp + totalDown || 1;
  const fillPercent = totalUp / total;

  const svgNS = "http://www.w3.org/2000/svg";

  // ------------------------------------
  // 1. BLACK OUTER FRAME (pixel-rounded)
  // ------------------------------------
  const frame = document.createElementNS(svgNS, "rect");
  frame.setAttribute("x", barX - 3 * SCALE);
  frame.setAttribute("y", barY - 3 * SCALE);
  frame.setAttribute("width", barWidth + 6 * SCALE);
  frame.setAttribute("height", barHeight + 6 * SCALE);
  frame.setAttribute("fill", "#000000");
  frame.setAttribute("shape-rendering", "crispEdges");
  auditRatioChart.appendChild(frame);

  // Pixel-rounded corners = 4 squares carved out:
  const carve = (x, y) => {
    const c = document.createElementNS(svgNS, "rect");
    c.setAttribute("x", x);
    c.setAttribute("y", y);
    c.setAttribute("width", 2 * SCALE);
    c.setAttribute("height", 2 * SCALE);
    c.setAttribute("fill", "#00000000"); // transparent hole
    c.setAttribute("shape-rendering", "crispEdges");
    auditRatioChart.appendChild(c);
  };

  // top-left
  carve(barX - 3 * SCALE, barY - 3 * SCALE);
  // top-right
  carve(barX + barWidth + SCALE, barY - 3 * SCALE);
  // bottom-left
  carve(barX - 3 * SCALE, barY + barHeight + SCALE);
  // bottom-right
  carve(barX + barWidth + SCALE, barY + barHeight + SCALE);

  // ------------------------------------
  // 2. DARK INNER STRIP
  // ------------------------------------
  const strip = document.createElementNS(svgNS, "rect");
  strip.setAttribute("x", barX);
  strip.setAttribute("y", barY);
  strip.setAttribute("width", barWidth);
  strip.setAttribute("height", barHeight);
  strip.setAttribute("fill", "#142311");
  strip.setAttribute("shape-rendering", "crispEdges");
  auditRatioChart.appendChild(strip);

  // ------------------------------------
  // 3. FILL SEGMENTS
  // ------------------------------------
  const segments = 20;
  const segmentWidth = barWidth / segments;
  const filledSegments = Math.round(segments * fillPercent);

  for (let i = 0; i < segments; i++) {
    const seg = document.createElementNS(svgNS, "rect");
    const x = barX + i * segmentWidth + 1 * SCALE;
    const w = segmentWidth - 2 * SCALE;

    seg.setAttribute("x", x);
    seg.setAttribute("y", barY + 1 * SCALE);
    seg.setAttribute("width", w);
    seg.setAttribute("height", barHeight - 2 * SCALE);
    seg.setAttribute("shape-rendering", "crispEdges");

    if (i < filledSegments) {
      seg.setAttribute("fill", "#55ff55"); // XP Green
    } else {
      seg.setAttribute("fill", "#20341a");
    }

    auditRatioChart.appendChild(seg);
  }

  // ------------------------------------
  // 4. RATIO NUMBER ABOVE BAR w/ OUTLINE
  // ------------------------------------
  const ratio = (ratioValue || 0).toFixed(1);

  const outline = document.createElementNS(svgNS, "text");
  outline.setAttribute("x", width / 2);
  outline.setAttribute("y", barY - 10 * SCALE);
  outline.setAttribute("fill", "#000000");
  outline.setAttribute("stroke", "#000000");
  outline.setAttribute("stroke-width", 2 * SCALE);
  outline.setAttribute("font-size", 12 * SCALE);
  outline.setAttribute("font-weight", "bold");
  outline.setAttribute("text-anchor", "middle");
  outline.setAttribute("shape-rendering", "crispEdges");
  outline.textContent = ratio;

  const text = document.createElementNS(svgNS, "text");
  text.setAttribute("x", width / 2);
  text.setAttribute("y", barY - 10 * SCALE);
  text.setAttribute("fill", "#55ff55");
  text.setAttribute("font-size", 12 * SCALE);
  text.setAttribute("font-weight", "bold");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("shape-rendering", "crispEdges");
  text.textContent = ratio;

  auditRatioChart.appendChild(outline);
  auditRatioChart.appendChild(text);
}



async function loadProjectStatus() {
  const projectQuery = `
    {
      user {
        progresses {
          grade
          object {
            name
            type
          }
        }
      }
    }
  `;

  const data = await graphqlRequest(projectQuery);

  if (!data || !data.user || data.user.length === 0) {
    console.error("Could not load project statuses");
    return;
  }

  const progresses = data.user[0].progresses;

  let passed = 0;
  let failed = 0;

  progresses.forEach((p) => {
    if (!p.object || p.object.type !== "project") return;
    if (p.grade === null) return;

    if (p.grade > 0) {
      passed++;
    } else {
      failed++;
    }
  });

  projectsPassedSpan.textContent = passed;
  projectsFailedSpan.textContent = failed;

  drawProjectStatusDonut(passed, failed);
}


// Minecraft cake top view: passed = normal icing, failed = burnt slice
function drawProjectStatusDonut(passed, failed) {
  projectStatusChart.innerHTML = "";

  const width = projectStatusChart.clientWidth || 220;
  const height = projectStatusChart.clientHeight || 220;
  const cx = width / 2;
  const cy = height / 2;

  // you already changed these, keep whatever you like
  const outerRadius = 80; // cake edge
  const innerRadius = 70; // inner icing edge

  const total = passed + failed || 1;
  const failFraction = failed / total;
  const passFraction = 1 - failFraction;

  const svgNS = "http://www.w3.org/2000/svg";
  const circumference = 2 * Math.PI * outerRadius;

  // 1. Cake base (beige outer ring)
  const cakeBase = document.createElementNS(svgNS, "circle");
  cakeBase.setAttribute("cx", cx);
  cakeBase.setAttribute("cy", cy);
  cakeBase.setAttribute("r", outerRadius);
  cakeBase.setAttribute("fill", "none");
  cakeBase.setAttribute("stroke", "#d7b898"); // cake color
  cakeBase.setAttribute("stroke-width", outerRadius - innerRadius + 10);
  cakeBase.setAttribute("shape-rendering", "crispEdges");
  projectStatusChart.appendChild(cakeBase);

  // 2. Pink icing ring around the top
  const icingRing = document.createElementNS(svgNS, "circle");
  icingRing.setAttribute("cx", cx);
  icingRing.setAttribute("cy", cy);
  icingRing.setAttribute("r", outerRadius - 4);
  icingRing.setAttribute("fill", "none");
  icingRing.setAttribute("stroke", "#ff76d4");
  icingRing.setAttribute("stroke-width", 14);
  icingRing.setAttribute("shape-rendering", "crispEdges");
  projectStatusChart.appendChild(icingRing);

  // 3. Burnt slice representing failed projects (dark brown arc)
  if (failed > 0) {
    const burnt = document.createElementNS(svgNS, "circle");
    burnt.setAttribute("cx", cx);
    burnt.setAttribute("cy", cy);
    burnt.setAttribute("r", outerRadius - 2);
    burnt.setAttribute("fill", "none");
    burnt.setAttribute("stroke", "#4b2115"); // burnt chocolate
    burnt.setAttribute("stroke-width", 18);
    burnt.setAttribute("stroke-linecap", "butt");
    burnt.setAttribute(
      "stroke-dasharray",
      circumference * failFraction + " " + circumference
    );
    burnt.setAttribute("stroke-dashoffset", circumference * (1 - failFraction));
    burnt.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
    burnt.setAttribute("shape-rendering", "crispEdges");
    projectStatusChart.appendChild(burnt);
  }

  // 4. Inner white icing circle (flat top)
  const inner = document.createElementNS(svgNS, "circle");
  inner.setAttribute("cx", cx);
  inner.setAttribute("cy", cy);
  inner.setAttribute("r", innerRadius - 4);
  inner.setAttribute("fill", "#ffffff");
  inner.setAttribute("stroke", "#f3f4f6");
  inner.setAttribute("stroke-width", 3);
  inner.setAttribute("opacity", "0.98");
  projectStatusChart.appendChild(inner);

  // 5. Sprinkles sitting ON the white icing (above the inner circle)
  const sprinkleCount = 70; // ← change this for more/less sprinkles

  for (let i = 0; i < sprinkleCount; i++) {
    // angle only on the passed portion
    const t = (i / sprinkleCount) * passFraction;
    const angle = (-90 + t * 360) * (Math.PI / 180);

    // random radius inside the white icing area
    const minR = innerRadius - 16;
    const maxR = innerRadius - 4;
    const sprinkleRadius = minR + Math.random() * (maxR - minR);

    const sx = cx + sprinkleRadius * Math.cos(angle);
    const sy = cy + sprinkleRadius * Math.sin(angle);

    const sprinkle = document.createElementNS(svgNS, "rect");
    const size = 4;

    sprinkle.setAttribute("x", sx - size / 2);
    sprinkle.setAttribute("y", sy - size / 2);
    sprinkle.setAttribute("width", size);
    sprinkle.setAttribute("height", size);
    sprinkle.setAttribute("fill", "#ff4b4b");
    sprinkle.setAttribute("shape-rendering", "crispEdges");

    projectStatusChart.appendChild(sprinkle);
  }

  // 6. Percentage text in the center
  const passPercent = Math.round(passFraction * 100);
  const text = document.createElementNS(svgNS, "text");
  text.setAttribute("x", cx);
  text.setAttribute("y", cy + 4);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "#111111");
  text.setAttribute("font-size", "18");
  text.setAttribute("font-weight", "bold");
  text.textContent = passPercent + "%";
  projectStatusChart.appendChild(text);
}

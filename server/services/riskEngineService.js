const SanctionEntry = require('../models/SanctionEntry');
const logger = require('../config/logger');

const HIGH_RISK_COUNTRIES = new Set(['IR', 'KP', 'SY', 'CU', 'VE', 'BY', 'MM', 'RU', 'SO', 'SD', 'LY', 'YE']);
const MEDIUM_RISK_COUNTRIES = new Set(['CN', 'AE', 'SA', 'HK', 'QA', 'KW']);

const WEIGHTS = {
  SANCTION_EXACT_MATCH: 100,
  SANCTION_STRONG_MATCH: 85,
  SANCTION_PARTIAL_MATCH: 60,
  HS_CODE_SANCTIONED: 75,
  COUNTRY_HIGH_RISK: 50,
  COUNTRY_MEDIUM_RISK: 25,
  END_USER_SENSITIVE: 65,
  SUPPLIER_HIGH_RISK: 40,
  SUPPLIER_MEDIUM_RISK: 20,
  AMOUNT_EXCEED: 15,
  MULTI_COUNTRY_RISK: 15,
  SANCTION_HISTORY: 30,
};

const SENSITIVE_ENDUSE_PATTERNS = [
  /军[工事防]/i, /核[设设]/i, /导[弹]/i, /航[天空]/i, /[武兵]器/i,
  /弹[药药]/i, /生[化物]/i, /炸[药弹]/i, /防[御务]/i, /国防/i,
  /军事/i, /卫星/i, /雷达/i, /潜艇/i, /装甲/i, /发射/i,
];

function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\s\-_.,()\[\]{}'"]/g, '')
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .trim();
}

function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }
  transpositions = Math.floor(transpositions / 2);

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateNameSimilarity(n1, n2) {
  const s1 = normalizeString(n1);
  const s2 = normalizeString(n2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 90;

  const jw = jaroWinkler(s1, s2);
  const lev = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const levScore = maxLen > 0 ? (1 - lev / maxLen) : 0;

  return Math.round(Math.max(jw * 100, levScore * 100));
}

async function findMatchingSanctions(transaction) {
  const matches = [];
  const searchFields = [
    { value: transaction.supplierName, field: 'supplier', weight: 1.2 },
    { value: transaction.endUser, field: 'endUser', weight: 1.5 },
  ];

  const countryQueries = [];
  if (transaction.originCountry) countryQueries.push(transaction.originCountry);
  if (transaction.supplierCountry) countryQueries.push(transaction.supplierCountry);
  if (transaction.endUserCountry) countryQueries.push(transaction.endUserCountry);

  const hsQuery = transaction.hsCode ? [
    { hsCodes: { $elemMatch: { $regex: `^${transaction.hsCode.split('.')[0]}` } } },
  ] : [];

  const countrySanctions = countryQueries.length > 0
    ? await SanctionEntry.find({
      isActive: true,
      $or: [
        { countries: { $in: countryQueries } },
        ...hsQuery,
      ],
    }).lean().limit(200)
    : [];

  for (const sanction of countrySanctions) {
    const hsMatched = sanction.hsCodes?.some(h =>
      transaction.hsCode && (h === transaction.hsCode || transaction.hsCode.startsWith(h.split('.')[0]))
    );

    if (hsMatched) {
      matches.push({
        sanction,
        matchedField: 'hsCode',
        matchScore: 92,
        matchValue: transaction.hsCode,
        level: 'STRONG',
      });
    }

    const countryMatched = sanction.countries?.some(c =>
      countryQueries.includes(c) && (
        sanction.entityType === 'COUNTRY' ||
        sanction.entityType === 'ORGANIZATION'
      )
    );

    if (countryMatched && sanction.entityType === 'COUNTRY') {
      matches.push({
        sanction,
        matchedField: 'country',
        matchScore: 88,
        matchValue: sanction.countries.find(c => countryQueries.includes(c)),
        level: 'STRONG',
      });
    }
  }

  const allSanctionNames = await SanctionEntry.find(
    { isActive: true, entityType: { $in: ['COMPANY', 'INDIVIDUAL', 'ORGANIZATION'] } },
    { name: 1, alternateNames: 1, aliases: 1, listName: 1, entityType: 1 }
  ).lean().limit(5000);

  for (const search of searchFields) {
    if (!search.value) continue;
    const searchNorm = normalizeString(search.value);

    for (const entry of allSanctionNames) {
      const allNames = [entry.name, ...(entry.alternateNames || []), ...(entry.aliases || [])];

      for (const name of allNames) {
        const similarity = calculateNameSimilarity(search.value, name);

        if (similarity >= 85) {
          matches.push({
            sanction: entry,
            matchedField: search.field + '_name',
            matchScore: similarity,
            matchValue: name,
            level: similarity >= 95 ? 'EXACT' : 'STRONG',
          });
          break;
        } else if (similarity >= 70 && search.weight >= 1.5) {
          matches.push({
            sanction: entry,
            matchedField: search.field + '_name',
            matchScore: similarity,
            matchValue: name,
            level: 'PARTIAL',
          });
          break;
        }
      }
    }
  }

  return matches;
}

function checkSensitiveEndUser(text) {
  if (!text) return { sensitive: false, matches: [] };
  const found = [];
  for (const pattern of SENSITIVE_ENDUSE_PATTERNS) {
    if (pattern.test(text)) {
      found.push(pattern.toString().replace(/[\/\\^$*+?.()|[\]{}]/g, ''));
    }
  }
  return { sensitive: found.length > 0, matches: found };
}

function getCountryRiskLevel(country) {
  if (!country) return 'NONE';
  if (HIGH_RISK_COUNTRIES.has(country)) return 'HIGH';
  if (MEDIUM_RISK_COUNTRIES.has(country)) return 'MEDIUM';
  return 'LOW';
}

async function calculateRiskScore(transaction) {
  const factors = [];
  let totalScore = 0;
  const matchedSanctions = [];

  const sanctionMatches = await findMatchingSanctions(transaction);

  for (const match of sanctionMatches) {
    let weight = 0;
    switch (match.level) {
      case 'EXACT': weight = WEIGHTS.SANCTION_EXACT_MATCH; break;
      case 'STRONG': weight = WEIGHTS.SANCTION_STRONG_MATCH; break;
      case 'PARTIAL': weight = WEIGHTS.SANCTION_PARTIAL_MATCH; break;
    }

    const score = Math.min(weight, match.matchScore);
    totalScore = Math.max(totalScore, score * 0.8 + totalScore * 0.1);
    totalScore = Math.min(100, totalScore + score * 0.3);

    factors.push({
      type: 'SANCTION_' + match.level + '_MATCH',
      description: `在${match.sanction.listName}名单中${match.level === 'EXACT' ? '精确' : match.level === 'STRONG' ? '高度' : '部分'}匹配: ${match.matchValue}`,
      score: score,
      matchedSanction: match.sanction.listName + '/' + match.sanction.name,
    });

    matchedSanctions.push({
      sanctionId: match.sanction._id,
      listName: match.sanction.listName,
      matchedField: match.matchedField,
      matchScore: match.matchScore,
      matchValue: match.matchValue,
    });
  }

  const originRisk = getCountryRiskLevel(transaction.originCountry);
  const supplierRisk = getCountryRiskLevel(transaction.supplierCountry);
  const endUserRisk = getCountryRiskLevel(transaction.endUserCountry);

  if (originRisk === 'HIGH') {
    totalScore = Math.min(100, totalScore + WEIGHTS.COUNTRY_HIGH_RISK);
    factors.push({ type: 'COUNTRY_HIGH_RISK_ORIGIN', description: `原产地${transaction.originCountry}为高风险国家`, score: WEIGHTS.COUNTRY_HIGH_RISK });
  } else if (originRisk === 'MEDIUM') {
    totalScore = Math.min(100, totalScore + WEIGHTS.COUNTRY_MEDIUM_RISK);
    factors.push({ type: 'COUNTRY_MEDIUM_RISK_ORIGIN', description: `原产地${transaction.originCountry}为中风险国家`, score: WEIGHTS.COUNTRY_MEDIUM_RISK });
  }

  if (supplierRisk === 'HIGH') {
    totalScore = Math.min(100, totalScore + WEIGHTS.COUNTRY_HIGH_RISK);
    factors.push({ type: 'COUNTRY_HIGH_RISK_SUPPLIER', description: `供应商所在国${transaction.supplierCountry}为高风险`, score: WEIGHTS.COUNTRY_HIGH_RISK });
  } else if (supplierRisk === 'MEDIUM') {
    totalScore = Math.min(100, totalScore + WEIGHTS.COUNTRY_MEDIUM_RISK);
    factors.push({ type: 'COUNTRY_MEDIUM_RISK_SUPPLIER', description: `供应商所在国${transaction.supplierCountry}为中风险`, score: WEIGHTS.COUNTRY_MEDIUM_RISK });
  }

  if (endUserRisk === 'HIGH') {
    totalScore = Math.min(100, totalScore + WEIGHTS.COUNTRY_HIGH_RISK);
    factors.push({ type: 'COUNTRY_HIGH_RISK_ENDUSER', description: `最终用户国${transaction.endUserCountry}为高风险`, score: WEIGHTS.COUNTRY_HIGH_RISK });
  }

  const highRiskCount = [originRisk, supplierRisk, endUserRisk].filter(r => r === 'HIGH').length;
  if (highRiskCount >= 2) {
    totalScore = Math.min(100, totalScore + WEIGHTS.MULTI_COUNTRY_RISK);
    factors.push({ type: 'MULTI_COUNTRY_RISK', description: `多国高风险组合 (${highRiskCount}个高风险国家)`, score: WEIGHTS.MULTI_COUNTRY_RISK });
  }

  const endUserSensitive = checkSensitiveEndUser(transaction.endUser + ' ' + (transaction.productDescription || ''));
  if (endUserSensitive.sensitive) {
    totalScore = Math.min(100, totalScore + WEIGHTS.END_USER_SENSITIVE);
    factors.push({ type: 'SENSITIVE_END_USER', description: `敏感最终用户/用途: ${endUserSensitive.matches.join(', ')}`, score: WEIGHTS.END_USER_SENSITIVE });
  }

  if (transaction.totalAmount && transaction.totalAmount > 1000000) {
    totalScore = Math.min(100, totalScore + WEIGHTS.AMOUNT_EXCEED);
    factors.push({ type: 'HIGH_VALUE_TRANSACTION', description: `高价值交易: ${transaction.currency} ${transaction.totalAmount.toLocaleString()}`, score: WEIGHTS.AMOUNT_EXCEED });
  }

  totalScore = Math.round(Math.min(100, totalScore));

  let riskLevel = 'LOW';
  const highThreshold = parseInt(process.env.RISK_THRESHOLD_HIGH || '80');
  const mediumThreshold = parseInt(process.env.RISK_THRESHOLD_MEDIUM || '50');

  if (totalScore >= highThreshold) riskLevel = 'CRITICAL';
  else if (totalScore >= highThreshold - 15) riskLevel = 'HIGH';
  else if (totalScore >= mediumThreshold) riskLevel = 'MEDIUM';

  return {
    riskScore: totalScore,
    riskLevel,
    riskFactors: factors,
    sanctionMatches: matchedSanctions,
  };
}

module.exports = {
  calculateRiskScore,
  findMatchingSanctions,
  calculateNameSimilarity,
  normalizeString,
  getCountryRiskLevel,
  WEIGHTS,
};

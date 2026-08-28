#!/usr/bin/env node
/** Refresh DataCite licence metadata used by the Dataset Registry table. */
const fs = require('fs');
const path = require('path');
const INPUT = path.join(__dirname, '..', 'data', 'datasets.json');
const OUTPUT = path.join(__dirname, '..', 'docs', 'registry-licenses.json');
function label(items) { return (items || []).map(r => r.rightsIdentifier || r.rights || r.rightsUri || r.rightsURI || '').filter(Boolean).join('; '); }
function creators(items) {
  return (items || []).map(function(c) {
    const identifier = (c.nameIdentifiers || []).find(function(id) { return String(id.nameIdentifierScheme || '').toUpperCase() === 'ORCID' || /orcid\.org/i.test(id.nameIdentifier || ''); });
    return {
      name: c.name || [c.givenName, c.familyName].filter(Boolean).join(' '),
      given: c.givenName || '', family: c.familyName || '',
      orcid: identifier ? String(identifier.nameIdentifier || '').replace(/^https?:\/\/orcid\.org\//i, '') : ''
    };
  }).filter(function(c) { return c.name; });
}
async function fetchOne(doi) {
  const response = await fetch('https://api.datacite.org/dois/' + encodeURIComponent(doi), { headers:{ Accept:'application/vnd.api+json', 'User-Agent':'AuScope-DOI-Tracker' } });
  if (response.status === 404) return [doi, { license:'', creators:[] }];
  if (!response.ok) throw new Error(doi + ': DataCite HTTP ' + response.status);
  const json = await response.json(), attrs = json.data && json.data.attributes || {};
  return [doi, { license:label(attrs.rightsList), creators:creators(attrs.creators) }];
}
async function run() {
  const rows = JSON.parse(fs.readFileSync(INPUT, 'utf8')).records || [];
  const dois = Array.from(new Set(rows.map(r => r.doi).filter(Boolean))), records = {}, creators = {};
  let cursor = 0;
  async function worker() { while (cursor < dois.length) { const pair = await fetchOne(dois[cursor++]), key = pair[0].toLowerCase(); records[key] = pair[1].license; creators[key] = pair[1].creators; } }
  await Promise.all(Array.from({length:8}, worker));
  fs.writeFileSync(OUTPUT, JSON.stringify({ generated:new Date().toISOString(), source:'DataCite REST API', records, creators }, null, 2) + '\n');
  console.log('Saved licence and creator metadata for ' + dois.length + ' dataset DOIs.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@forge/bridge';

const JQL_OPERATORS = ['=', '!=', '~', '!~', 'in', 'not in', 'is', 'is not', '>', '<', '>=', '<='];
const JQL_KEYWORDS = ['AND', 'OR', 'NOT', 'ORDER BY', 'ASC', 'DESC', 'EMPTY', 'NULL'];
const JQL_FUNCTIONS = [
  'openSprints()', 'closedSprints()', 'futureSprints()',
  'currentUser()', 'membersOf("group")',
  'startOfDay()', 'endOfDay()', 'startOfWeek()', 'endOfWeek()',
  'startOfMonth()', 'endOfMonth()', 'startOfYear()', 'endOfYear()',
  'now()',
];

// Well-known JQL field names for operator detection
const KNOWN_FIELDS = new Set([
  'project', 'issuetype', 'status', 'priority', 'assignee', 'reporter',
  'resolution', 'labels', 'fixVersion', 'affectedVersion', 'component',
  'sprint', 'created', 'updated', 'duedate', 'summary', 'description',
  'type', 'key', 'id', 'parent', 'creator', 'watcher', 'voter',
  'level', 'originalEstimate', 'remainingEstimate', 'timespent',
  'workratio', 'category', 'text', 'issuekey',
]);

function getContext(text, availableFields) {
  if (!text) return { type: 'keyword', prefix: '' };

  const trimmed = text.trimEnd();

  // Check if we just typed "project = " or "project in (" -> suggest projects
  const projectEqMatch = trimmed.match(/\bproject\s*=\s*$/i);
  if (projectEqMatch) return { type: 'project', prefix: '' };

  const projectInMatch = trimmed.match(/\bproject\s+in\s*\(\s*$/i);
  if (projectInMatch) return { type: 'project', prefix: '' };

  // Check for "project = partial" or "project in (partial" or "project in (VAL, partial"
  const projectEqPartial = trimmed.match(/\bproject\s*=\s*(\S*)$/i);
  if (projectEqPartial) return { type: 'project', prefix: projectEqPartial[1].replace(/^["']/, '') };

  const projectInPartial = trimmed.match(/\bproject\s+in\s*\([^)]*,?\s*(\S*)$/i);
  if (projectInPartial) return { type: 'project', prefix: projectInPartial[1].replace(/^["']/, '') };

  // Find the last token (split by whitespace, parens, commas)
  const tokenMatch = trimmed.match(/([^\s,()]+)$/);
  const lastToken = tokenMatch ? tokenMatch[1] : '';

  // Find previous token(s) for context
  const beforeLastToken = trimmed.slice(0, trimmed.length - lastToken.length).trimEnd();
  const prevTokenMatch = beforeLastToken.match(/([^\s,()]+)$/);
  const prevToken = prevTokenMatch ? prevTokenMatch[1] : '';

  // If the previous token looks like a field name (known or from available fields), suggest operators
  const allFieldIds = new Set([...KNOWN_FIELDS]);
  const allFieldNames = new Map();
  if (availableFields) {
    for (const f of availableFields) {
      allFieldIds.add(f.id.toLowerCase());
      allFieldNames.set(f.name.toLowerCase(), f);
    }
  }

  // After a field + operator, if in function-like context suggest functions
  if (lastToken && (lastToken.includes('(') || /^[a-zA-Z]+\(/.test(lastToken))) {
    const funcPrefix = lastToken.replace(/.*\(/, '');
    return { type: 'function', prefix: funcPrefix };
  }

  // If lastToken is empty (just typed a space), check what came before
  if (!lastToken && prevToken) {
    const prevLower = prevToken.toLowerCase();
    // Previous was a field -> suggest operators
    if (allFieldIds.has(prevLower) || allFieldNames.has(prevLower) ||
        /^customfield_\d+$/i.test(prevToken) || /^"[^"]*"$/.test(prevToken)) {
      return { type: 'operator', prefix: '' };
    }
    // Previous was an operator -> suggest functions/values
    if (JQL_OPERATORS.includes(prevToken) || JQL_OPERATORS.includes(prevToken.toLowerCase())) {
      return { type: 'function', prefix: '' };
    }
  }

  // lastToken has content — figure out what it could be
  if (lastToken.length >= 1) {
    const lowerLastToken = lastToken.toLowerCase();

    // If the token before lastToken is a known field, we're typing an operator
    if (prevToken) {
      const prevLower = prevToken.toLowerCase();
      if (allFieldIds.has(prevLower) || allFieldNames.has(prevLower) || /^customfield_\d+$/i.test(prevToken)) {
        return { type: 'operator', prefix: lastToken };
      }
      // If prevToken is an operator, suggest functions
      if (JQL_OPERATORS.includes(prevToken)) {
        return { type: 'function', prefix: lastToken };
      }
    }

    // Check if it matches a keyword prefix
    const keywordMatch = JQL_KEYWORDS.some(k => k.toLowerCase().startsWith(lowerLastToken));

    // Check if it looks like a field name prefix (at least 2 chars)
    if (lastToken.length >= 2) {
      const fieldMatch = availableFields && availableFields.some(f =>
        f.name.toLowerCase().includes(lowerLastToken) || f.id.toLowerCase().includes(lowerLastToken)
      );
      if (fieldMatch) return { type: 'field', prefix: lastToken };
    }

    if (keywordMatch) return { type: 'keyword', prefix: lastToken };

    // Fallback: if 2+ chars, try fields
    if (lastToken.length >= 2) return { type: 'field', prefix: lastToken };
  }

  return { type: 'keyword', prefix: lastToken };
}

function getSuggestions(context, availableFields, availableProjects) {
  const { type, prefix } = context;
  const lower = (prefix || '').toLowerCase();

  switch (type) {
    case 'field': {
      if (!availableFields) return [];
      return availableFields
        .filter(f => f.name.toLowerCase().includes(lower) || f.id.toLowerCase().includes(lower))
        .slice(0, 12)
        .map(f => ({ label: f.name, hint: f.id, insert: /\s/.test(f.name) ? `"${f.name}"` : f.id }));
    }
    case 'operator': {
      return JQL_OPERATORS
        .filter(op => !lower || op.toLowerCase().startsWith(lower))
        .map(op => ({ label: op, hint: 'operator', insert: op }));
    }
    case 'project': {
      if (!availableProjects) return [];
      return availableProjects
        .filter(p => !lower || p.key.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower))
        .slice(0, 12)
        .map(p => ({ label: p.key, hint: p.name, insert: p.key }));
    }
    case 'function': {
      return JQL_FUNCTIONS
        .filter(fn => !lower || fn.toLowerCase().startsWith(lower))
        .map(fn => ({ label: fn, hint: 'function', insert: fn }));
    }
    case 'keyword': {
      return JQL_KEYWORDS
        .filter(kw => !lower || kw.toLowerCase().startsWith(lower))
        .map(kw => ({ label: kw, hint: 'keyword', insert: kw }));
    }
    default:
      return [];
  }
}

export default function JqlInput({ value, onChange, placeholder, availableFields, availableProjects }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [validation, setValidation] = useState(null); // { valid, count, error } | null
  const [validating, setValidating] = useState(false);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);
  const validationDebounceRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced validation
  const validateJql = useCallback((jql) => {
    if (validationDebounceRef.current) clearTimeout(validationDebounceRef.current);
    if (!jql || !jql.trim()) {
      setValidation(null);
      setValidating(false);
      return;
    }
    setValidating(true);
    validationDebounceRef.current = setTimeout(async () => {
      try {
        const result = await invoke('validateJql', { jql });
        setValidation(result);
      } catch (err) {
        setValidation({ valid: false, count: 0, error: err.message || 'Validation failed' });
      }
      setValidating(false);
    }, 800);
  }, []);

  // Trigger validation when value changes
  useEffect(() => {
    validateJql(value);
    return () => {
      if (validationDebounceRef.current) clearTimeout(validationDebounceRef.current);
    };
  }, [value, validateJql]);

  function updateSuggestions(text) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const ctx = getContext(text, availableFields);
      const sugs = getSuggestions(ctx, availableFields, availableProjects);
      setSuggestions(sugs);
      setSelectedIdx(0);
      setShowDropdown(sugs.length > 0);
    }, 50);
  }

  function handleChange(e) {
    const newVal = e.target.value;
    onChange(newVal);
    updateSuggestions(newVal);
  }

  function insertSuggestion(suggestion) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = value || '';
    const cursorPos = textarea.selectionStart || text.length;
    const beforeCursor = text.slice(0, cursorPos);

    // Find the token we're replacing
    const tokenMatch = beforeCursor.match(/([^\s,()]+)$/);
    const tokenStart = tokenMatch ? cursorPos - tokenMatch[1].length : cursorPos;

    const afterCursor = text.slice(cursorPos);
    const newText = beforeCursor.slice(0, tokenStart) + suggestion.insert + ' ' + afterCursor;
    onChange(newText);
    setShowDropdown(false);

    // Set cursor position after insertion
    const newPos = tokenStart + suggestion.insert.length + 1;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    });
  }

  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter' && showDropdown && suggestions.length > 0) {
      e.preventDefault();
      insertSuggestion(suggestions[selectedIdx]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      return;
    }
    if (e.key === 'Tab' && showDropdown && suggestions.length > 0) {
      e.preventDefault();
      insertSuggestion(suggestions[selectedIdx]);
      return;
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (dropdownRef.current && showDropdown) {
      const item = dropdownRef.current.children[selectedIdx];
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, showDropdown]);

  const validationLine = (() => {
    if (!value || !value.trim()) {
      return { text: 'Enter a JQL query', color: '#97A0AF' };
    }
    if (validating) {
      return { text: 'Validating...', color: '#6B778C', spin: true };
    }
    if (validation) {
      if (validation.valid) {
        return { text: `${validation.count} issue${validation.count !== 1 ? 's' : ''} match`, color: '#00875A' };
      }
      return { text: `Invalid: ${validation.error}`, color: '#DE350B' };
    }
    return null;
  })();

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        style={jqlStyles.textarea}
        placeholder={placeholder || 'project = MYPROJECT AND sprint in openSprints()'}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value) updateSuggestions(value);
        }}
        spellCheck={false}
      />

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div ref={dropdownRef} style={jqlStyles.dropdown}>
          {suggestions.slice(0, 8).map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              style={{
                ...jqlStyles.dropdownItem,
                background: i === selectedIdx ? '#DEEBFF' : 'transparent',
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent textarea blur
                insertSuggestion(s);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span style={jqlStyles.suggestionLabel}>{s.label}</span>
              <span style={jqlStyles.suggestionHint}>{s.hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Validation status line */}
      {validationLine && (
        <div style={{ ...jqlStyles.validationLine, color: validationLine.color }}>
          {validationLine.spin && (
            <span style={jqlStyles.spinner} />
          )}
          {!validationLine.spin && validationLine.color === '#00875A' && (
            <span style={{ marginRight: '4px' }}>&#10003;</span>
          )}
          {!validationLine.spin && validationLine.color === '#DE350B' && (
            <span style={{ marginRight: '4px' }}>&#10007;</span>
          )}
          {validationLine.text}
        </div>
      )}
    </div>
  );
}

const jqlStyles = {
  textarea: {
    width: '100%', minHeight: '72px', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#172B4D',
    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
  },
  dropdown: {
    position: 'absolute', left: 0, right: 0, top: '100%',
    background: '#fff', border: '1px solid #DFE1E6', borderRadius: '0 0 4px 4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto',
    zIndex: 50,
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
  },
  suggestionLabel: { fontWeight: 500, color: '#172B4D' },
  suggestionHint: { fontSize: '10px', color: '#97A0AF', fontFamily: 'monospace', marginLeft: '8px', flexShrink: 0 },
  validationLine: {
    fontSize: '11px', padding: '4px 2px 0', display: 'flex', alignItems: 'center',
    gap: '2px', lineHeight: 1.4,
  },
  spinner: {
    display: 'inline-block', width: '10px', height: '10px', marginRight: '4px',
    border: '2px solid #DFE1E6', borderTop: '2px solid #6B778C', borderRadius: '50%',
    animation: 'spin 0.6s linear infinite', // reuses @keyframes spin from styles.css
  },
};

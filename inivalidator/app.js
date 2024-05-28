var madeChanges = false;
window.onbeforeunload = function() {
    if (madeChanges)
    {
        return 'You have made changes since you last saved, leaving the website will result in a permanent loss of the data.';
    }
};
HTMLFormElement.prototype.getData = function()
{
    let data = {};
    this.querySelectorAll('input, select').forEach(input => {
        if (input.type == 'checkbox')
        {
            data[input.name] = input.checked;
            return;
        }
        data[input.name] = input.value;
    });
    return data;
}
HTMLFormElement.prototype.setData = function(data)
{
    this.querySelectorAll('input, select').forEach(input => {
        if (data[input.name] != null)
        {
            if (input.type == 'checkbox')
            {
                input.checked = data[input.name];
                return;
            }
            input.value = data[input.name];
        }
    });
}

/** Handle settings model */
document.getElementById('model-settings').addEventListener('show.bs.modal', e => {
    let settings = validator.getSettings();
    settings.commentRegex = settings.commentRegex.source.match(/\[(.*)\]/)[1];
    document.getElementById('form-settings').setData(settings);
});

function onValidateConfig(e)
{
    // Reset result view
    //
    let resultView          = document.getElementById('result');
    let resultViewSuccess   = document.getElementById('result').getElementsByClassName('result-success')[0];
    let resultViewMessages  = document.getElementById('error-list');
    resultView.style.display            = 'none';
    resultViewSuccess.style.display     = 'none';
    resultViewMessages.style.display    = 'none';
    resultViewMessages.innerHTML        = '';

    // Show loader
    //
    document.getElementById('btn-validate-text').style.display = 'none';
    document.getElementById('btn-validate-text-loading').style.display = '';

    setTimeout(() => {
        // Preform lint
        editor.performLint();
    }, 50);
}

/**
 * 
 * @param {HTMLFormElement} form 
 */
function onSubmitSettings(form)
{
    let data = form.getData();
    data.commentRegex = new RegExp('^\\s*[' + data.commentRegex + '].*');
    validator.setSettings(data);
    validator.saveSettings();
    return false; // Prevent default
}

/** Handle link save model */
const MODEL_SAVE = new bootstrap.Modal(document.getElementById('model-save-link'));
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();

        let saveUrl =  new URL(window.location.href);
        saveUrl.hash = encodeURIComponent(editor.getValue());
        document.getElementById('model-save-link-full').value = saveUrl.toString();
        MODEL_SAVE.show();
    }
});

// Enable tooltips
var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
});

// Custom data actions
document.querySelectorAll('[data-action="copy-to-clip"]').forEach(element => {

    // Data target is required
    //
    if (!element.hasAttribute('data-target'))
    {
        return;
    }

    element.addEventListener('click', e => {
        let textToCopy = document.querySelector(element.getAttribute('data-target')).value;
        
        // Copy the text inside the text field
        navigator.clipboard.writeText(textToCopy);

        if (element.hasAttribute('data-bs-original-title'))
        {
            let originalTitle = element.getAttribute('data-bs-original-title');

            element.setAttribute('data-bs-original-title', element.getAttribute('data-success-title'));
            bootstrap.Tooltip.getInstance(element).show(element.getAttribute('data-success-title'));
            element.setAttribute('data-bs-original-title', originalTitle);
        }
    });
});

/** Setup */
const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    lineNumbers: true,
    tabSize: 2,
    mode: 'properties',
    gutters: ["CodeMirror-lint-markers"],
    lint: { lintOnChange: false }
});
editor.on('change', () => {
    madeChanges = true;
});
const URI = new URL(window.location.href);

/**
 * JsDoc Defines
 * @typedef Message
 * @property {string} message 
 * @property {'warning'|'error'} severity
 * @property {number} line 
 * @property {number} colStart 
 * @property {number} colEnd 
 * 
* @typedef ValidatorSettings
* @property {boolean} settings.allowDuplicateKeys
* @property {boolean} settings.allowDuplicateSections
* @property {boolean} settings.allowKeysWithoutSection
* @property {RegExp} settings.commentRegex
 */

function Validator()
{
    /**
     * Validates the given text
     * @param {string} text 
     * @returns {Array} An array of messages
     */
    this.validate = function(text)
    {
        _elements.resetResultView();

        // Reset our data
        //
        _messages = [];
        _sections = {};
        _sectionPointer = null;
        
        // Check all lines
        //
        let lines = text.replace(/[\t]/, '').split(/[\r\n]/);
        for (let i = 0; i < lines.length; i++)
        {
            try
            {
                _validateLine(i, lines[i]);
            }
            catch (ex)
            {
                console.error(ex, 'When validating line \'' + i + '\'');
            }
        }
        _renderResult();
        // Hide loader
        //
        document.getElementById('btn-validate-text').style.display = '';
        document.getElementById('btn-validate-text-loading').style.display = 'none';
        
        return _messages;
    }

    /**
     * @param {ValidatorSettings} settings 
     */
    this.setSettings = function(settings)
    {
        _settings = settings;
    }
    /**
     * @returns {ValidatorSettings}
     */
    this.getSettings = function()
    {
        return { ..._settings };
    }
    /**
     * 
     * @param {string} saveAs 
     */
    this.saveSettings = function(saveAs = 'default')
    {
        let itemId = 'ini.settings.default';

        let settings = this.getSettings();
        settings.commentRegex = settings.commentRegex.source.match(/\[(.*)\]/)[1];
        localStorage.setItem(itemId, JSON.stringify(settings));
    }

    var _messages = [];
    var _sections = {};
    var _sectionPointer = null;
    /**
     * Contains all keys not in a section.
     */
    var _global = [];

    // Get our default settings
    //
    /**
     * @type {ValidatorSettings}
     */
    var _settings = JSON.parse(localStorage.getItem('ini.settings.default'));
    if (_settings == null)
    {
        _settings = {
            allowDuplicateKeys: false,
            allowDuplicateSections: false,
            allowKeysWithoutSection: false,
    
            commentRegex: /^\s*[#;].*/
        };
    }
    else
    {
        _settings.commentRegex = new RegExp('^\\s*[' + _settings.commentRegex + '].*');
        //_settings.commentRegex = new RegExp(_settings.commentRegex.replace(/[\/\\]+/gm, ''));
    }

    var _elements = {
        resultView: document.getElementById('result'),
        resultViewSuccess: document.getElementById('result').getElementsByClassName('result-success')[0],
        resultViewMessages: document.getElementById('error-list'),

        resetResultView()
        {
            this.resultView.style.display                   = 'none';
            this.resultViewSuccess.style.display            = 'none';
            this.resultViewMessages.style.display           = 'none';
            this.resultViewMessages.innerHTML               = '';
        }
    };

    /**
     * Checks a line for errors/warnings
     * @returns {Array.<string>} 
     */
    var _validateLine = function(lineNumber, line)
    {
        // Ignore empty lines
        //
        if (_isEmptyString(line))
        {
            return;
        }

        // Ignore comments
        //
        if (_isComment(line))
        {
            return;
        }

        // Check if we found a new section
        //
        if (_isSection(line))
        {
            _validateSection(lineNumber, line);
        }
        // Else we validate if the line is a correct keyValue pair
        else
        {
            _validateProperty(lineNumber, line);
        }
    }
    var _validateSection = function(lineNumber, line)
    {
        let hasError = false;
        // Check if our section has no end
        //
        if (line.indexOf(']') == -1)
        {
            _messages.push(_createMessage(
                'error',
                'Section has no end character \']\'',
                lineNumber,
                0,
                line.length
            ));
            hasError = true;
        }

        // Check if our section is empty
        //
        if (_isEmptySection(line))
        {
            _messages.push(_createMessage(
                'error',
                'Section name can not be empty',
                lineNumber,
                0,
                line.length
            ));
            hasError = true;
        }

        // Add our section when no error occurred
        //
        if (!hasError)
        {
            // Get the section name
            let name = line.substring(line.indexOf('[')+1, line.indexOf(']'));

            if (_sections[name] != null && !_settings.allowDuplicateSections)
            {
                _messages.push(_createMessage(
                    'error',
                    'Section with name \'' + name + '\' already exists.\n   Duplicate Sections not allowed, enable in settings to ignore this error.',
                    lineNumber,
                    0,
                    line.length
                ));
                return;
            }
            
            _sections[name] = [];
            _sectionPointer = name;

            // Check if any none commented text was appended to the end of the section
            //
            let appendedText = line.substring(line.indexOf(']') + 1, line.length);
            if (appendedText != '' && !_isEmptyString(appendedText) && !_isComment(appendedText))
            {
                _messages.push(_createMessage(
                    'error',
                    'No content expected after the section end \']\'',
                    lineNumber,
                    0,
                    line.length
                ));
            }
        }
    }
    var _validateProperty = function(lineNumber, line)
    {
        let setterIndex = line.indexOf('=');

        // Check if our property has a setter character '='
        //
        if (setterIndex == -1)
        {
            _messages.push(_createMessage(
                'error',
                'KeyValue pair has no setter \'=\'',
                lineNumber,
                0,
                line.length
            ));
        }
        else
        {
            let escapedLine = line.replace(/\s/g, '');
            let escapedSetterIndex = escapedLine.indexOf('=');
            let key = escapedLine.substring(0, escapedSetterIndex);
            // Validate our keyname
            //
            if (_keyHasSpecialCharacters(key))
            {
                _messages.push(_createMessage(
                    'error',
                    'Key name can not contain special characters ?{}|&~![()^".',
                    lineNumber,
                    setterIndex - key.length,
                    setterIndex
                ));
            }

            var currentSection = null;
            // Show an error when this key has no section when not allowed
            //
            if (Object.keys(_sections).length < 1)
            {
                if (!_settings.allowKeysWithoutSection)
                {
                    _messages.push(_createMessage(
                        'error',
                        'Keys without section are not allowed.',
                        lineNumber,
                        0,
                        line.length
                    ));
                    return;
                }
                currentSection = _global;
            }
            // Get the current section if not _global
            //
            if (currentSection === null)
            {
                currentSection = _sections[_sectionPointer];
            }
            // Show an error when key is a duplicate key when not allowed
            //
            if (currentSection.includes(key) && !_settings.allowDuplicateKeys)
            {
                var message = 'Property with key \'' + key + '\' already exists in section \'' + _sectionPointer + '\'.\n    Duplicate Keys not allowed, enable in settings to ignore this error.';
                if (_sectionPointer == null)
                {
                    message = 'Property with key \'' + key + '\' already exists globaly.\n    Duplicate Keys not allowed, enable in settings to ignore this error.';
                }
                _messages.push(_createMessage(
                    'error',
                    message,
                    lineNumber,
                    0,
                    line.length
                ));
                return;
            }
            
            // Add the key to the section if successfull
            currentSection.push(key);
        }
    }

    var _isEmptyString = function(value)
    {
        return /^\s*$/.test(value);
    }
    var _isComment = function(value)
    {
        return _settings.commentRegex.test(value);
    }
    var _isSection = function(value)
    {
        return /^\s*\[.*/.test(value);
    }
    var _isEmptySection = function(value)
    {
        return /^\s*\[\]\s*/.test(value);
    }
    var _keyHasSpecialCharacters = function(value)
    {
        return /[\?{}\|&~!\[\(\)\^"]/g.test(value);
    }

    /**
     * Creates a new message object
     * @param {'warning'|'error'} severity
     * @param {string} message 
     * @param {number} line 
     * @param {number} colStart 
     * @param {number} colEnd 
     * @param {Message} message 
     */
    var _createMessage = function(severity, message, line, colStart, colEnd)
    {
        return {
            message: severity + " on line " + (line+1) + ':\n\n' + message,
            severity: severity,
            from: CodeMirror.Pos(line, colStart),
            to: CodeMirror.Pos(line, colEnd)
        }
    }

    /**
     * Renders the result view
     */
    var _renderResult = function()
    {
        _elements.resultView.style.display = 'unset';

        if (_messages.length > 0)
        {
            _messages.forEach(message => {
                _renderMessage(message);
            });
            _elements.resultViewMessages.style.display = '';
            return;
        }

        _elements.resultViewSuccess.style.display = '';
    }
    /**
     * Renders a message in the result message list
     * @param {Message} message 
     */
    var _renderMessage = function(message)
    {
        errorLine = document.createElement('p');
        errorLine.className = 'm-2 p-2 ';
        errorLine.className += message.severity == 'warning' ? 'text-warning result-warning' : 'text-danger result-error'
        errorLine.innerText = message.message
    
        document.getElementById('error-list').appendChild(errorLine);
    }
};
const validator = new Validator();
CodeMirror.registerHelper("lint", "properties", (text, options) => validator.validate(text));

// Handle mode actions
//
if (URI.searchParams.has('mode'))
{
    switch (URI.searchParams.get('mode'))
    {
        case 'asterisk':
            validator.setSettings({
                allowDuplicateKeys: true,
                allowDuplicateSections: true,
                commentRegex: /^\s*[;].*/
            });
        break;
    }
}
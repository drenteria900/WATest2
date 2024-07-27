require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Load credentials from .env
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const WA_USERNAME = process.env.WA_USERNAME.replace(/"/g, '');  // Remove quotes if any
const PASSWORD = process.env.PASSWORD;
const ACCOUNT_ID = process.env.ACCOUNT_ID;

console.log('Environment variables:');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET);
console.log('WA_USERNAME:', WA_USERNAME); // This should print the full email address
console.log('PASSWORD:', PASSWORD);
console.log('ACCOUNT_ID:', ACCOUNT_ID);

async function getAccessToken() {
    const tokenUrl = 'https://oauth.wildapricot.org/auth/token';
    const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const bodyParams = new URLSearchParams({
        'grant_type': 'password',
        'username': WA_USERNAME,
        'password': PASSWORD,
        'scope': 'auto'
    }).toString();

    console.log('Request details:');
    console.log('URL:', tokenUrl);
    console.log('Headers:', {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
    });
    console.log('Body:', bodyParams);

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader
            },
            body: bodyParams
        });

        const text = await response.text();
        console.log('Response text:', text);  // Log the raw response text for debugging
        try {
            const data = JSON.parse(text);
            if (data.error) {
                console.error('Error getting access token:', data);
                throw new Error(data.error_description || 'Failed to get access token');
            }
            console.log('Access token obtained successfully');
            return data.access_token;
        } catch (e) {
            console.error('Error parsing JSON response:', text);
            throw new Error('Invalid JSON response');
        }
    } catch (error) {
        console.error('Error in getAccessToken:', error);
        throw error;
    }
}

async function getContacts(accessToken, limit = 10, offset = 0) {
    const apiUrl = `https://api.wildapricot.org/v2.3/accounts/${ACCOUNT_ID}/contacts?$async=false&$top=${limit}&$skip=${offset}`;
    try {
        let response = await fetch(apiUrl, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let data = await response.json();
        console.log('API response:', JSON.stringify(data, null, 2));

        // Map the response to include only the required fields
        let contacts = data.Contacts.map(contact => ({
            Id: contact.Id,
            FirstName: contact.FirstName || 'N/A',
            LastName: contact.LastName || 'N/A',
            Status: contact.FieldValues.find(field => field.FieldName === 'Status')?.Value?.Label || 'N/A',
            StatusId: contact.FieldValues.find(field => field.FieldName === 'Status')?.Value?.Id || 'N/A',
            Veteran: contact.FieldValues.find(field => field.FieldName === 'Veteran')?.Value || 'N/A',
            Email: contact.Email || 'N/A',
            Phone: contact.Phone || 'N/A'
        }));

        return contacts;
    } catch (error) {
        console.error('Error getting contacts:', error);
        throw error;
    }
}

async function updateContactStatus(accessToken, contactId, newStatusId) {
    const apiUrl = `https://api.wildapricot.org/v2.3/accounts/${ACCOUNT_ID}/contacts/${contactId}`;
    
    // Fetch the current contact to get the existing FieldValues
    let contactResponse = await fetch(apiUrl, {
        headers: {
            'Authorization': 'Bearer ' + accessToken
        }
    });

    if (!contactResponse.ok) {
        throw new Error(`HTTP error! status: ${contactResponse.status}`);
    }

    let contactData = await contactResponse.json();
    let fieldValues = contactData.FieldValues;

    // Update the Status field
    fieldValues = fieldValues.map(field => {
        if (field.FieldName === 'Status') {
            return {
                ...field,
                Value: { Id: newStatusId, Label: statuses.find(status => status.id === newStatusId).label } // Update Id and Label
            };
        }
        return field;
    });

    const body = {
        Id: contactId,
        FieldValues: fieldValues
    };

    console.log('Request body for updating status:', JSON.stringify(body, null, 2));  // Log the request body

    try {
        let response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let data = await response.json();
        console.log('Update response:', JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('Error updating contact status:', error);
        throw error;
    }
}

app.get('/api/contacts', async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const accessToken = await getAccessToken();
        const contacts = await getContacts(accessToken, limit, offset);
        res.json(contacts);
    } catch (error) {
        console.error('Error in /api/contacts:', error);
        res.status(500).json({ error: error.message || 'An error occurred while fetching contacts' });
    }
});

app.put('/api/contacts/:id/status', async (req, res) => {
    const contactId = req.params.id;
    const newStatusId = req.body.statusId;

    try {
        const accessToken = await getAccessToken();
        const updatedContact = await updateContactStatus(accessToken, contactId, newStatusId);
        res.json(updatedContact);
    } catch (error) {
        console.error('Error in updating contact status:', error);
        res.status(500).json({ error: error.message || 'An error occurred while updating contact status' });
    }
});

app.get('/api/fields', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const fields = await getContactFields(accessToken);
        res.json(fields);
    } catch (error) {
        console.error('Error in /api/fields:', error);
        res.status(500).json({ error: error.message || 'An error occurred while fetching contact fields' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
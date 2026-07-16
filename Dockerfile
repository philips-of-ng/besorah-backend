# Use the official lightweight Node image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Expose the port Back4app provides
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
# Use Node.js 20-alpine as the base image for a small footprint
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application source code 
COPY . .

# Expose the port our app runs on
EXPOSE 3000

# Start the application in development mode (using nodemon)
CMD ["npm", "run", "dev"]

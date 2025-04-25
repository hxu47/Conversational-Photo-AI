import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Image, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  TextInput, 
  SafeAreaView, 
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export default function App() {
  const [image, setImage] = useState(null);
  const [caption, setCaption] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiConversation, setAiConversation] = useState(null);
  const [userResponse, setUserResponse] = useState('');

  // Request permission to access the camera roll
  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera roll permissions to make this work!',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  // Pick an image from the library
  const pickImage = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        setImage(selectedAsset.uri);
        setCaption(null);
        setAiConversation(null);
        setError(null);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      setError('Failed to pick image: ' + err.message);
    }
  };

  // Take a photo with the camera
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera permissions to make this work!',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        setImage(selectedAsset.uri);
        setCaption(null);
        setAiConversation(null);
        setError(null);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      setError('Failed to take photo: ' + err.message);
    }
  };

  // Analyze the image using Hugging Face API
  const analyzeImage = async () => {
    if (!image) return;

    setLoading(true);
    setError(null);
    const HF_API_KEY = 'Replace with your own API key';

    try {
      // Read the image file
      const imageBase64 = await FileSystem.readAsStringAsync(image, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Using a reliable model for captioning
      const captioningApiUrl = 'https://router.huggingface.co/hf-inference/models/Salesforce/blip-image-captioning-base';
      
      let generatedCaption = '';
      
      try {
        // Get the image caption
        const captionResponse = await fetch(captioningApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: {
              image: imageBase64,
            },
          }),
        });

        if (!captionResponse.ok) {
          throw new Error(`API error (captioning): ${await captionResponse.text()}`);
        }

        const captionData = await captionResponse.json();
        console.log('Caption response:', captionData);
        
        // Get the generated caption
        generatedCaption = Array.isArray(captionData) ? 
          captionData[0]?.generated_text : 
          captionData?.generated_text;
          
      } catch (captionError) {
        console.error('Error with Hugging Face API:', captionError);
        // Fallback: Generate a basic caption based on image properties
        generatedCaption = await generateFallbackCaption(image);
      }
      
      setCaption(generatedCaption || 'No caption generated');
      
      // Generate conversational response based on the caption using Gemini API
      await generateConversationalResponse(generatedCaption);
      
    } catch (err) {
      console.error('Error analyzing image:', err);
      setError('Failed to analyze image: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Generate a fallback caption when the Hugging Face API fails
  const generateFallbackCaption = async (imageUri) => {
    try {
      // Get basic image information that we can use
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      const currentDate = new Date().toLocaleDateString();
      const currentTime = new Date().toLocaleTimeString();
      
      // Check if the file is an image
      if (imageUri.toLowerCase().endsWith('.jpg') || 
          imageUri.toLowerCase().endsWith('.jpeg') || 
          imageUri.toLowerCase().endsWith('.png')) {
            
        // Using a generalizable fallback caption
        return `An image captured on ${currentDate} at ${currentTime}`;
      } else {
        return `A photo in your gallery`;
      }
    } catch (error) {
      console.error('Error generating fallback caption:', error);
      return 'A photo you selected';
    }
  };

  // Function to generate conversational response based on the caption using Gemini API
  const generateConversationalResponse = async (caption) => {
    if (!caption) return;
    
    try {
      // Gemini API endpoint and key
      const geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
      const geminiApiKey = 'Replace with your own API key';

      // Create a conversational prompt for Gemini
      const prompt = `You are an AI assistant that helps users understand their photos. 
      
Based on this image description: "${caption}", generate a friendly, personalized response (1-2 sentences) that:
1. Acknowledges what's in the image in a positive way
2. Asks a simple question about the image that encourages the user to share more details

Make it sound natural and conversational, not like a generic question.`;
      
      const response = await fetch(`${geminiApiUrl}?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
          }
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Gemini API response:', data);
      
      // Extract the generated text from Gemini's response structure
      let conversationalResponse = '';
      if (data && data.candidates && data.candidates.length > 0 && 
          data.candidates[0].content && data.candidates[0].content.parts && 
          data.candidates[0].content.parts.length > 0) {
        conversationalResponse = data.candidates[0].content.parts[0].text;
      }
      
      if (conversationalResponse) {
        setAiConversation(conversationalResponse.trim());
      } else {
        throw new Error('No valid response from Gemini API');
      }
      
    } catch (err) {
      console.error('Error generating conversational response with Gemini:', err);
      // Fallback to default conversation
      generateDefaultConversation(caption);
    }
  };

  // Fallback function to generate default conversation if the API call fails
  const generateDefaultConversation = (caption) => {
    let conversation = "I see your photo! What makes this moment special to you?";
    
    // Add some caption-specific elements if possible
    if (caption) {
      if (caption.includes("person") || caption.includes("people")) {
        conversation = "What a wonderful moment with people! What's the story behind this photo?";
      } else if (caption.includes("food") || caption.includes("meal")) {
        conversation = "That food looks delicious! What made this meal special?";
      } else if (caption.includes("pet") || caption.includes("cat") || caption.includes("dog")) {
        conversation = "What an adorable pet! What makes this moment special?";
      } else if (caption.includes("landscape") || caption.includes("beach") || caption.includes("mountain")) {
        conversation = "What a beautiful view! What memories does this place hold for you?";
      }
    }
    
    setAiConversation(conversation);
  };

  // Save the response
  const saveResponse = () => {
    if (!image || !caption || !userResponse.trim()) return;
    
    Alert.alert(
      "Response Saved",
      "Your response has been saved successfully.",
      [
        { 
          text: "OK", 
          onPress: () => {
            setUserResponse('');
            clearImage();
          }
        }
      ]
    );
  };

  // Clear the current image and analysis
  const clearImage = () => {
    setImage(null);
    setCaption(null);
    setAiConversation(null);
    setUserResponse('');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Conversational Photo AI</Text>
        <Text style={styles.subtitle}>Lab 8 Demo</Text>
      </View>
      
      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image Preview */}
        {image ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image }} style={styles.imagePreview} />
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              Select or take a photo to analyze
            </Text>
          </View>
        )}
        
        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4285F4" />
            <Text style={styles.loadingText}>Analyzing image...</Text>
          </View>
        )}
        
        {/* Analysis Results */}
        {caption && (
          <View style={styles.analysisContainer}>
            <Text style={styles.sectionTitle}>AI Analysis Results</Text>
            
            {/* Generated Caption */}
            <View style={styles.section}>
              <Text style={styles.sectionSubtitle}>Generated Caption:</Text>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
            
            {/* AI Conversation */}
            {aiConversation && (
              <View style={styles.conversationContainer}>
                <Text style={styles.sectionSubtitle}>AI Response:</Text>
                <View style={styles.aiMessageBubble}>
                  <Text style={styles.aiMessageText}>{aiConversation}</Text>
                </View>
                
                <Text style={styles.sectionSubtitle}>Your Response:</Text>
                <TextInput
                  style={styles.responseInput}
                  placeholder="Type your response here..."
                  multiline={true}
                  numberOfLines={3}
                  value={userResponse}
                  onChangeText={setUserResponse}
                />
                
                <TouchableOpacity 
                  style={styles.saveButton} 
                  onPress={saveResponse}
                  disabled={!userResponse.trim()}
                >
                  <Text style={styles.saveButtonText}>Save Response</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      
      {/* Control Buttons */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlButton} onPress={pickImage}>
          <Text style={styles.buttonText}>📁 Gallery</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={takePhoto}>
          <Text style={styles.buttonText}>📷 Camera</Text>
        </TouchableOpacity>
        
        {image && (
          <>
            <TouchableOpacity 
              style={[styles.controlButton, styles.analyzeButton]} 
              onPress={analyzeImage} 
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.analyzeButtonText]}>
                🔍 Analyze
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.controlButton} onPress={clearImage}>
              <Text style={styles.buttonText}>❌ Clear</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#4285F4',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  scrollContainer: {
    flex: 1,
    marginBottom: Platform.OS === 'ios' ? 0 : 10,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 30,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  imagePreview: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
  },
  placeholderContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#d32f2f',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  analysisContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  section: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#555',
  },
  captionText: {
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  conversationContainer: {
    marginTop: 10,
  },
  aiMessageBubble: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  aiMessageText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  responseInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  controlsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  controlButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    minWidth: 70,
    marginHorizontal: 2,
  },
  analyzeButton: {
    backgroundColor: '#4285F4',
  },
  buttonText: {
    fontWeight: '600',
    color: '#555',
  },
  analyzeButtonText: {
    color: 'white',
  }
});
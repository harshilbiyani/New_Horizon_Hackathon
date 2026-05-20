"""
AI-Based Survivor Detection Model
Uses probabilistic multi-signal fusion for intelligent detection decisions
"""

import numpy as np
from typing import Tuple, Dict


class AIDetector:
    """
    Probabilistic survivor detection using logistic regression.
    
    Combines multiple sensor signals (thermal, visual, motion) to produce
    probability-based detection output instead of hard rules.
    
    This is a lightweight ML model that can be trained or tuned.
    """
    
    def __init__(self, weights: np.ndarray = None, bias: float = None,
                 learning_rate: float = 0.1):
        """
        Initialize AI detector.
        
        Args:
            weights: Signal weights [thermal, visual, motion]. If None, uses defaults.
            bias: Model bias term. If None, uses default.
            learning_rate: Learning rate for online updates
        """
        # Default well-tuned weights
        # Thermal signal most important (0.5), visual secondary (0.3), motion (0.2)
        self.weights = weights if weights is not None else np.array([0.5, 0.3, 0.2])
        self.bias = bias if bias is not None else -0.3
        self.learning_rate = learning_rate
        
        # Tracking
        self.predictions_history = []
        self.training_samples = []
    
    @staticmethod
    def sigmoid(x: float) -> float:
        """
        Sigmoid activation function.
        
        Args:
            x: Input value
            
        Returns:
            Probability between 0 and 1
        """
        # Clip to prevent overflow
        x = np.clip(x, -500, 500)
        return 1.0 / (1.0 + np.exp(-x))
    
    def predict(self, thermal: float, visual: float, motion: float,
               return_details: bool = False) -> Tuple[float, bool]:
        """
        Predict if signals indicate a survivor.
        
        Args:
            thermal: Thermal signal strength (0.0-1.0)
            visual: Visual signal strength (0.0-1.0)
            motion: Motion signal strength (0.0-1.0)
            return_details: If True, return detailed prediction info
            
        Returns:
            Tuple of (probability, is_survivor_bool) or detailed dict if return_details=True
        """
        # Input vector
        signals = np.array([thermal, visual, motion])
        
        # Normalize signals to reasonable range
        signals = np.clip(signals, 0.0, 1.0)
        
        # Linear combination (logit)
        logit = np.dot(self.weights, signals) + self.bias
        
        # Convert to probability
        probability = self.sigmoid(logit)
        
        # Hard decision (threshold at 0.5)
        is_survivor = probability > 0.5
        
        # Store prediction
        self.predictions_history.append({
            'signals': (thermal, visual, motion),
            'probability': probability,
            'decision': is_survivor
        })
        
        if return_details:
            return {
                'probability': probability,
                'decision': is_survivor,
                'thermal_contribution': self.weights[0] * thermal,
                'visual_contribution': self.weights[1] * visual,
                'motion_contribution': self.weights[2] * motion,
                'confidence': abs(probability - 0.5) * 2  # 0-1 scale
            }
        
        return probability, is_survivor
    
    def train_sample(self, thermal: float, visual: float, motion: float,
                    ground_truth: bool):
        """
        Online learning from a labeled sample (simple gradient update).
        
        Args:
            thermal: Thermal signal
            visual: Visual signal
            motion: Motion signal
            ground_truth: True if sample is actually a survivor
        """
        # Get prediction
        prob, _ = self.predict(thermal, visual, motion)
        
        # Target (0 or 1)
        target = 1.0 if ground_truth else 0.0
        
        # Prediction error
        error = target - prob
        
        # Update weights (gradient descent on cross-entropy)
        signals = np.array([thermal, visual, motion])
        self.weights += self.learning_rate * error * signals
        
        # Update bias
        self.bias += self.learning_rate * error
        
        # Store training sample
        self.training_samples.append({
            'signals': (thermal, visual, motion),
            'ground_truth': ground_truth,
            'error': error
        })
    
    def batch_train(self, samples: list):
        """
        Train on multiple labeled samples.
        
        Args:
            samples: List of (thermal, visual, motion, is_survivor) tuples
        """
        for thermal, visual, motion, is_survivor in samples:
            self.train_sample(thermal, visual, motion, is_survivor)
    
    def adjust_weights(self, new_weights: np.ndarray, new_bias: float):
        """
        Manually adjust model weights (for tuning or transfer).
        
        Args:
            new_weights: New weight vector
            new_bias: New bias term
        """
        self.weights = np.array(new_weights)
        self.bias = new_bias
    
    def get_model_confidence(self) -> float:
        """
        Get average model confidence on recent predictions.
        
        Returns:
            Average confidence (0-1) where 0.5 is least confident
        """
        if not self.predictions_history:
            return 0.5
        
        recent = self.predictions_history[-100:]  # Last 100
        confidences = [abs(p['probability'] - 0.5) * 2 for p in recent]
        
        return np.mean(confidences) if confidences else 0.5
    
    def get_accuracy_on_training(self) -> float:
        """
        Get accuracy on training samples seen so far.
        
        Returns:
            Accuracy percentage (0-100)
        """
        if not self.training_samples:
            return 0.0
        
        correct = 0
        for sample in self.training_samples:
            thermal, visual, motion = sample['signals']
            expected = sample['ground_truth']
            
            _, pred = self.predict(thermal, visual, motion)
            
            if pred == expected:
                correct += 1
        
        return (correct / len(self.training_samples)) * 100
    
    def export_model(self) -> Dict:
        """
        Export model parameters for saving/transfer.
        
        Returns:
            Dictionary with model state
        """
        return {
            'weights': self.weights.tolist(),
            'bias': float(self.bias),
            'learning_rate': self.learning_rate,
            'training_samples_count': len(self.training_samples),
            'predictions_count': len(self.predictions_history)
        }
    
    def get_signal_importance(self) -> Dict[str, float]:
        """
        Get relative importance of each signal based on weights.
        
        Returns:
            Dictionary with signal importances
        """
        total = np.sum(np.abs(self.weights))
        
        importance = {
            'thermal': abs(self.weights[0]) / total * 100,
            'visual': abs(self.weights[1]) / total * 100,
            'motion': abs(self.weights[2]) / total * 100
        }
        
        return importance


class EnsembleDetector:
    """
    Ensemble of detectors for robust predictions.
    Combines multiple AI detectors for improved accuracy.
    """
    
    def __init__(self, num_detectors: int = 3):
        """
        Initialize ensemble.
        
        Args:
            num_detectors: Number of detectors in ensemble
        """
        self.detectors = [AIDetector() for _ in range(num_detectors)]
    
    def predict(self, thermal: float, visual: float, motion: float) -> Tuple[float, bool]:
        """
        Predict using ensemble voting.
        
        Args:
            thermal: Thermal signal
            visual: Visual signal
            motion: Motion signal
            
        Returns:
            Tuple of (ensemble_probability, majority_vote)
        """
        probabilities = []
        
        for detector in self.detectors:
            prob, _ = detector.predict(thermal, visual, motion)
            probabilities.append(prob)
        
        # Average probability
        ensemble_prob = np.mean(probabilities)
        
        # Majority vote
        is_survivor = ensemble_prob > 0.5
        
        return ensemble_prob, is_survivor
    
    def train_sample(self, thermal: float, visual: float, motion: float,
                    ground_truth: bool):
        """
        Train all detectors on a sample.
        
        Args:
            thermal: Thermal signal
            visual: Visual signal
            motion: Motion signal
            ground_truth: Ground truth label
        """
        for detector in self.detectors:
            detector.train_sample(thermal, visual, motion, ground_truth)
    
    def get_avg_accuracy(self) -> float:
        """Get average accuracy across ensemble."""
        accuracies = [d.get_accuracy_on_training() for d in self.detectors]
        return np.mean(accuracies) if accuracies else 0.0


if __name__ == "__main__":
    # Quick test
    print("Testing AI Detector...")
    
    detector = AIDetector()
    
    # Test samples (real survivor, noise, ambiguous)
    test_cases = [
        (0.9, 0.8, 0.7, "Real survivor"),
        (0.7, 0.2, 0.1, "Noise/false positive"),
        (0.85, 0.6, 0.5, "Ambiguous"),
        (0.3, 0.2, 0.1, "Clear non-survivor"),
    ]
    
    print("\nInitial Model Predictions:")
    print("-" * 60)
    
    for thermal, visual, motion, label in test_cases:
        prob, pred = detector.predict(thermal, visual, motion)
        print(f"{label:25s} → Prob: {prob:.3f} | Decision: {'SURVIVOR' if pred else 'NOT SURVIVOR'}")
    
    # Simulate training
    print("\nTraining on 10 samples...")
    training_samples = [
        (0.9, 0.8, 0.7, True),
        (0.85, 0.75, 0.6, True),
        (0.7, 0.2, 0.1, False),
        (0.3, 0.1, 0.05, False),
        (0.8, 0.7, 0.6, True),
        (0.6, 0.3, 0.2, False),
        (0.88, 0.82, 0.68, True),
        (0.4, 0.2, 0.1, False),
        (0.92, 0.85, 0.73, True),
        (0.2, 0.1, 0.05, False),
    ]
    
    detector.batch_train(training_samples)
    
    print("\nAfter Training:")
    print("-" * 60)
    print(f"Training Accuracy: {detector.get_accuracy_on_training():.1f}%")
    print(f"Model Confidence: {detector.get_model_confidence():.3f}")
    print(f"Signal Importance: {detector.get_signal_importance()}")
    
    print("\nModel Export:")
    print(detector.export_model())
    
    print("\n✓ AI Detector test complete!")

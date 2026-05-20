"""
Comprehensive Test Suite for AI Detector
Tests probabilistic detection, training, and ensemble methods
"""

from ai_detector import AIDetector, EnsembleDetector
import numpy as np


def test_basic_prediction():
    """Test basic prediction without training."""
    print("\n[1] BASIC PREDICTION TEST")
    print("-" * 70)
    
    detector = AIDetector()
    
    # Test cases
    test_cases = [
        (0.9, 0.8, 0.7, "Real survivor - strong signals"),
        (0.7, 0.2, 0.1, "Noise/false positive - weak non-thermal"),
        (0.85, 0.6, 0.5, "Possible survivor - mixed signals"),
        (0.3, 0.2, 0.1, "Clear non-survivor - weak all"),
        (0.95, 0.9, 0.85, "Strong real survivor - all high"),
    ]
    
    print(f"{'Input Signals':<25} {'Probability':<15} {'Decision':<15}")
    print("-" * 70)
    
    predictions = []
    for thermal, visual, motion, label in test_cases:
        prob, pred = detector.predict(thermal, visual, motion)
        decision = "SURVIVOR" if pred else "NOT SURVIVOR"
        print(f"({thermal:.1f}, {visual:.1f}, {motion:.1f})    {prob:>6.3f}         {decision:<15}")
        predictions.append((prob, pred))
    
    # Verify reasonable predictions
    assert predictions[0][0] > 0.5, "Strong signals should have above 50% probability"
    assert predictions[3][0] < 0.5, "Weak signals should have below 50% probability"
    assert predictions[4][0] > predictions[1][0], "Stronger signals should rank higher"
    
    print("\n[OK] Basic prediction test passed!\n")


def test_online_training():
    """Test online learning capability."""
    print("[2] ONLINE TRAINING TEST")
    print("-" * 70)
    
    detector = AIDetector(learning_rate=0.2)
    
    # Initial prediction
    prob_before, _ = detector.predict(0.8, 0.5, 0.4)
    print(f"Initial prediction for (0.8, 0.5, 0.4): {prob_before:.3f}")
    
    # Train on samples
    training_samples = [
        (0.9, 0.8, 0.7, True),   # Real survivors
        (0.85, 0.75, 0.6, True),
        (0.7, 0.2, 0.1, False),  # False positives
        (0.3, 0.1, 0.05, False),
        (0.8, 0.7, 0.6, True),
    ]
    
    print(f"\nTraining on {len(training_samples)} samples...")
    detector.batch_train(training_samples)
    
    # Prediction after training
    prob_after, pred_after = detector.predict(0.8, 0.5, 0.4)
    print(f"After training prediction: {prob_after:.3f}")
    print(f"Probability change: {abs(prob_after - prob_before):.3f}")
    
    # Check accuracy
    accuracy = detector.get_accuracy_on_training()
    print(f"Training accuracy: {accuracy:.1f}%")
    
    assert accuracy > 50, "Should achieve better than random accuracy"
    
    print("\n[OK] Online training test passed!\n")


def test_signal_importance():
    """Test signal importance calculation."""
    print("[3] SIGNAL IMPORTANCE TEST")
    print("-" * 70)
    
    detector = AIDetector()
    
    importance = detector.get_signal_importance()
    
    print(f"Signal Importance (%):")
    print(f"  Thermal: {importance['thermal']:.1f}%")
    print(f"  Visual:  {importance['visual']:.1f}%")
    print(f"  Motion:  {importance['motion']:.1f}%")
    
    # Thermal should be most important
    assert importance['thermal'] > importance['visual'], "Thermal should be most important"
    assert importance['visual'] > importance['motion'], "Visual should be more important than motion"
    
    print("\n[OK] Signal importance test passed!\n")


def test_confidence_metric():
    """Test model confidence."""
    print("[4] MODEL CONFIDENCE TEST")
    print("-" * 70)
    
    detector = AIDetector()
    
    # Generate predictions
    test_signals = [
        (0.9, 0.8, 0.7),  # High confidence
        (0.5, 0.5, 0.5),  # Low confidence (near boundary)
        (0.1, 0.1, 0.1),  # High confidence
    ]
    
    for signals in test_signals:
        prob, _ = detector.predict(*signals)
        confidence = abs(prob - 0.5) * 2
        print(f"Signals {signals} → Prob: {prob:.3f} → Confidence: {confidence:.3f}")
    
    # Overall confidence
    overall_conf = detector.get_model_confidence()
    print(f"\nOverall model confidence: {overall_conf:.3f}")
    
    print("\n[OK] Confidence metric test passed!\n")


def test_ensemble():
    """Test ensemble detection."""
    print("[5] ENSEMBLE DETECTION TEST")
    print("-" * 70)
    
    ensemble = EnsembleDetector(num_detectors=3)
    
    # Test ensemble prediction
    test_signals = [
        (0.9, 0.8, 0.7, "Real survivor"),
        (0.7, 0.2, 0.1, "False positive"),
    ]
    
    for thermal, visual, motion, label in test_signals:
        prob, pred = ensemble.predict(thermal, visual, motion)
        decision = "SURVIVOR" if pred else "NOT SURVIVOR"
        print(f"{label:<20} → Ensemble Prob: {prob:.3f} → {decision}")
    
    # Train ensemble
    training_samples = [
        (0.9, 0.8, 0.7, True),
        (0.85, 0.75, 0.6, True),
        (0.7, 0.2, 0.1, False),
        (0.3, 0.1, 0.05, False),
    ]
    
    print(f"\nTraining ensemble on {len(training_samples)} samples...")
    for thermal, visual, motion, is_survivor in training_samples:
        ensemble.train_sample(thermal, visual, motion, is_survivor)
    
    avg_accuracy = ensemble.get_avg_accuracy()
    print(f"Average ensemble accuracy: {avg_accuracy:.1f}%")
    
    assert avg_accuracy > 50, "Ensemble should learn"
    
    print("\n[OK] Ensemble test passed!\n")


def test_model_export():
    """Test model persistence."""
    print("[6] MODEL EXPORT/IMPORT TEST")
    print("-" * 70)
    
    detector = AIDetector()
    
    # Train
    training_samples = [(0.9, 0.8, 0.7, True), (0.7, 0.2, 0.1, False)]
    detector.batch_train(training_samples)
    
    # Export
    model_dict = detector.export_model()
    
    print(f"Exported model:")
    print(f"  Weights: {model_dict['weights']}")
    print(f"  Bias: {model_dict['bias']:.3f}")
    print(f"  Training samples: {model_dict['training_samples_count']}")
    print(f"  Predictions: {model_dict['predictions_count']}")
    
    # Create new detector and test prediction before import
    detector2 = AIDetector()
    prob_before, _ = detector2.predict(0.8, 0.6, 0.5)
    
    # Manually set weights (simulate import)
    detector2.adjust_weights(np.array(model_dict['weights']), model_dict['bias'])
    prob_after, _ = detector2.predict(0.8, 0.6, 0.5)
    
    print(f"\nPrediction change after import: {abs(prob_after - prob_before):.3f}")
    assert prob_after != prob_before, "Weights should affect prediction"
    
    print("\n[OK] Export/import test passed!\n")


def test_various_scenarios():
    """Test various realistic scenarios."""
    print("[7] REALISTIC SCENARIOS TEST")
    print("-" * 70)
    
    detector = AIDetector()
    
    scenarios = {
        "Clear daylight conditions": [(0.95, 0.95, 0.90)],
        "Thermal camera only": [(0.85, 0.2, 0.1)],
        "Motion detected": [(0.6, 0.5, 0.9)],
        "Buried survivor (weak signals)": [(0.4, 0.3, 0.2)],
        "Equipment interference": [(0.8, 0.7, 0.3)],
    }
    
    for scenario, signals in scenarios.items():
        prob, pred = detector.predict(*signals[0])
        decision = "DETECTED" if pred else "NOT DETECTED"
        print(f"{scenario:<35} → {prob:.3f} → {decision}")
    
    print("\n[OK] Scenarios test passed!\n")


def main():
    """Run all tests."""
    print("\n" + "="*70)
    print("AI DETECTOR TEST SUITE")
    print("="*70)
    
    try:
        test_basic_prediction()
        test_online_training()
        test_signal_importance()
        test_confidence_metric()
        test_ensemble()
        test_model_export()
        test_various_scenarios()
        
        print("="*70)
        print("[SUCCESS] ALL AI DETECTOR TESTS PASSED!")
        print("="*70 + "\n")
        
        return True
    
    except AssertionError as e:
        print(f"\n[FAILED] {e}\n")
        return False
    except Exception as e:
        print(f"\n[ERROR] {e}\n")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
